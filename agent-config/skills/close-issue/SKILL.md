---
name: close-issue
description: Global skill for the Linear-side close ritual of a ralph-workflow feature branch. Use when the user has finished reviewing an In-Review Linear issue and is ready to ship — runs the Linear preflight (state, blockers), untracked-file preservation, delegates VCS integration to the project-local `close-branch` skill, then handles stale-parent labeling, the Linear Done transition, codex broker reap, and worktree removal. Invoke from the main-checkout CWD with the Linear issue ID as an argument (e.g. `/close-issue ENG-197`). Requires the project to provide a `close-branch` skill at `.claude/skills/close-branch/` — that skill owns every project-specific git decision (base branch, merge strategy, push model, branch-delete policy).
argument-hint: <issue-id>
model: sonnet
allowed-tools: Skill, Bash, Read, Glob, Grep
---

# Close Issue

The Linear-side close ritual for a ralph-workflow feature branch, run AFTER the user has reviewed the work. This skill runs every concern that's invariant across projects using ralph (Linear state lifecycle, blocker ordering, worktree/branch naming, codex broker plumbing) and delegates every project-specific VCS decision (base branch, merge strategy, push model) to the project-local `close-branch` skill.

This skill is NOT for doing tests, code review, docs, or decision captures — those belong in `/prepare-for-review`, which runs earlier in the lifecycle. See `agent-config/docs/playbooks/ralph-v2-usage.md` for how this fits the ralph cycle.

## When to Use

- After the user has reviewed a Linear issue in `$RALPH_REVIEW_STATE` (default `In Review`) and approved the work for merge.
- On a feature branch in a worktree under `.worktrees/` (created by `using-git-worktrees` or the ralph orchestrator).

## Invocation

Invoke from the **main-checkout CWD** (repo root) with the Linear issue ID as the only argument:

```
/close-issue ENG-197
```

Running from inside the worktree being closed used to be the norm, but it pinned the Bash tool's session CWD to that worktree — any external cause (another process, stray `rm`, hook) that removed the directory mid-ritual killed the session instantly. Invoking from the main checkout removes that failure class entirely: the CWD is stable throughout, and all worktree-side git ops use `git -C "$WORKTREE_PATH" …`.

## Capture issue ID up front

The agent receives the issue ID as the invocation argument and exposes it as `$ISSUE_ID`. If the argument is missing, stop and ask the user for it.

## Main-checkout-CWD invariant

Verify the session is rooted in the main checkout, not a linked worktree. In a main checkout, `.git` is a directory; in a linked worktree, `.git` is a file.

```bash
MAIN_REPO=$(git rev-parse --show-toplevel)
if [ -f "$MAIN_REPO/.git" ]; then
  echo "Error: must be invoked from the main checkout, not a linked worktree." >&2
  echo "Detected worktree root at: $MAIN_REPO" >&2
  exit 1
fi
```

## Source ralph-start libs

Source from the globally-installed ralph-start skill (`$HOME/.claude/skills/ralph-start/`), not from the current project. This treats ralph-start as an installed peer skill and keeps close-issue portable across projects — matches the sourcing style `/ralph-spec` already uses.

`config.sh` exports the `RALPH_*` workflow state names (`$RALPH_REVIEW_STATE`, `$RALPH_DONE_STATE`, `$RALPH_STALE_PARENT_LABEL`) and transitively sources `lib/linear.sh`. `branch_ancestry.sh` is sourced explicitly for `resolve_branch_for_issue`, `is_branch_fresh_vs_sha`, and `list_commits_ahead`.

```bash
RALPH_LIB="$HOME/.claude/skills/ralph-start/scripts/lib"
source "$RALPH_LIB/config.sh" \
  "${RALPH_CONFIG:-$HOME/.claude/skills/ralph-start/config.json}"
source "$RALPH_LIB/branch_ancestry.sh"
```

## Resolve `FEATURE_BRANCH` and `WORKTREE_PATH`

Linear's branch-name convention is lowercase `<issue-id>-<slug>`. The shared ancestry helper is the primary resolver; Linear's canonical `.branchName` is a one-shot fallback for historic/renamed branches.

```bash
resolve_rc=0
FEATURE_BRANCH=$(resolve_branch_for_issue "$ISSUE_ID") || resolve_rc=$?

if [ "$resolve_rc" -eq 2 ]; then
  # Multiple matches — genuinely ambiguous. The helper has already printed
  # the candidate branches to stderr. Stop rather than silently picking one.
  exit 1
fi

if [ "$resolve_rc" -eq 1 ] || [ -z "$FEATURE_BRANCH" ]; then
  # Zero matches — fall back to Linear's canonical branchName in case the
  # local branch uses a non-standard prefix (rename, historic naming).
  FEATURE_BRANCH=$(linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.branchName // empty')
  if [ -z "$FEATURE_BRANCH" ] || ! git show-ref --verify --quiet "refs/heads/$FEATURE_BRANCH"; then
    ISSUE_SLUG=$(echo "$ISSUE_ID" | tr '[:upper:]' '[:lower:]')
    echo "Error: no local branch matches '${ISSUE_SLUG}-*', and Linear's branchName for $ISSUE_ID was not found locally." >&2
    exit 1
  fi
fi

WORKTREE_PATH=$(git worktree list --porcelain | awk -v b="refs/heads/$FEATURE_BRANCH" '
  /^worktree / { path = substr($0, 10) }
  $0 == "branch " b { print path; exit }
')

if [ -z "$WORKTREE_PATH" ]; then
  echo "Error: no worktree found for branch $FEATURE_BRANCH." >&2
  exit 1
fi
```

All subsequent commands reference `$FEATURE_BRANCH`, `$ISSUE_ID`, `$WORKTREE_PATH`, and `$MAIN_REPO`. The CWD stays at `$MAIN_REPO` for the entire ritual — worktree-side operations use `git -C "$WORKTREE_PATH" …`.

## Pre-flight

### 1. Verify the issue is in the review state

```bash
linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.state.name'
```

Expected: `$RALPH_REVIEW_STATE` (default: `In Review`; workspaces can customize via `config.json`).

- **Matches `$RALPH_REVIEW_STATE`** — proceed.
- **Matches `$RALPH_IN_PROGRESS_STATE`** — the work hasn't been handed off for review yet. Run `/prepare-for-review` first.
- **Matches `$RALPH_DONE_STATE`** — nothing to do; the branch was already closed. Investigate whether this worktree is leftover and can be removed.
- **Any other state** — stop and surface to the user. The dispatch lifecycle is off.

### 2. Verify all `blocked-by` parents are Done

```bash
blockers_json=$(linear_get_issue_blockers "$ISSUE_ID") || exit 1

printf '%s\n' "$blockers_json" | jq -r --arg done "$RALPH_DONE_STATE" '
  if type == "array" and all(.[]; has("id") and has("state")) then
    .[] | select(.state != $done) | "\(.id)\t\(.state)"
  else
    error("linear_get_issue_blockers returned unexpected JSON shape")
  end
'
```

Two fail-closed hinges, both required to keep "no output means proceed" trustworthy:

1. **Capture then filter, not pipe.** `blockers_json=$(...) || exit 1` surfaces helper failures (Linear API, auth, pagination overflow) as a non-zero exit. A direct pipe would feed empty stdin to `jq` on helper failure, which produces empty output and exit 0 — masquerading as "no blockers, proceed."
2. **Validate shape in jq.** The `type == "array" and all(...; has("id") and has("state"))` guard ensures an unexpected return shape (wrapper object, `null`, `{}`, schema drift) errors out instead of iterating to empty output.

- **Non-zero exit** — either the helper failed or its JSON didn't match the expected shape; a diagnostic is on stderr. STOP and surface to the user; the blocker set is unknown and proceeding is unsafe.
- **No output from `jq`** — no unresolved blockers; proceed.
- **Any output from `jq`** — each line is `<blocker-id>\t<state>`. STOP. Print the list and refuse to close. Tell the user: `Canceled` blockers are NOT treated as resolved (per ralph v2 Decision 6 in `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md`); the supported way to declare "this is no longer a blocker" is to remove the relation in Linear via `linear issue relation delete "$ISSUE_ID" blocked-by <blocker-id>` and re-run. No `--force` escape hatch.

Why this belongs in pre-flight: ralph v2 dispatches child branches before their parents are Done. If the child closes first, the child's branch still carries the parent's un-reviewed commits — close-branch's rebase reconciles content but doesn't know which commits belong to which issue, and close-branch's fast-forward merge then lands the parent's work on the base branch as a side effect of closing the child. Guarding at the child's close time keeps the "nothing merges until it's been reviewed" invariant intact.

`linear_get_issue_blockers` is sourced from the ralph-start skill's library. It uses `linear api` (GraphQL) rather than text-parsing `linear issue relation list` output — see the function's docstring for rationale and pagination behavior.

### 3. Preserve untracked files

```bash
git -C "$WORKTREE_PATH" ls-files --others --exclude-standard
```

If this lists any files, stop and ask the user what to do with each one. Options:
- Commit them (if they're part of the work that should land).
- Copy them out to a safe location (e.g., `~/ralph-handoff-artifacts/$ISSUE_ID/`) before removing the worktree.
- Explicitly discard if they're truly ephemeral.

Never silently discard untracked files. `plan.md` files have been lost this way before — the whole reason this pre-flight exists. Run this BEFORE invoking `close-branch`: it's a data-safety gate for the worktree-removal step later in this skill, not a precondition for rebase.

## Invoke `close-branch`

Hand off VCS integration to the project-local `close-branch` skill via the `Skill` tool. `close-branch` owns every project-specific decision: base branch, rebase policy, merge strategy, push model, branch-delete semantics.

On entry, `close-branch` can assume:

- CWD is the main checkout (`.git` is a directory).
- Linear issue is in `$RALPH_REVIEW_STATE` with all `blocked-by` parents in `$RALPH_DONE_STATE`.
- Untracked files in `$WORKTREE_PATH` have been preserved or explicitly discarded.
- A file at `$MAIN_REPO/.close-branch-inputs` contains `ISSUE_ID`, `FEATURE_BRANCH`, `WORKTREE_PATH` in single-quoted `KEY='VALUE'` format, readable via `source`.

Shell variables set in `close-issue`'s Bash calls don't reliably propagate into `close-branch`'s Bash calls — each Bash tool dispatch is a fresh shell, and the spec explicitly notes that exports don't cross Skill-tool invocation boundaries. Pass inputs symmetrically with the return channel: write them to a gitignored file that `close-branch` sources at entry.

Before invoking, also delete any stale result file from a previously interrupted `/close-issue` run. Without this, a PR-pending `close-branch` (which intentionally writes no result file) would leave the file containing the previous issue's SHA + summary, and close-issue would apply stale-parent labeling and the final message against the wrong integration point.

Escape embedded single quotes before writing — `WORKTREE_PATH` is an absolute filesystem path and for portable use across projects it may contain quotes (e.g. `/home/Sean's laptop/.worktrees/...`). POSIX single-quote escape: `'` → `'\''` (close the quote, insert an escaped literal, reopen).

```bash
rm -f "$MAIN_REPO/.close-branch-result"

sq_escape() {
  printf "%s" "$1" | sed "s/'/'\\\\''/g"
}

{
  printf "ISSUE_ID='%s'\n"       "$(sq_escape "$ISSUE_ID")"
  printf "FEATURE_BRANCH='%s'\n" "$(sq_escape "$FEATURE_BRANCH")"
  printf "WORKTREE_PATH='%s'\n"  "$(sq_escape "$WORKTREE_PATH")"
} > "$MAIN_REPO/.close-branch-inputs"
```

Invoke `close-branch`. It sources and deletes the inputs file at entry. On non-zero exit from `close-branch`, print the diagnostic and stop — **no cleanup runs on failure**. Linear Done transition, stale-parent labeling, and worktree removal are all skipped. Partial state is `close-branch`'s concern to report; the operator decides recovery.

## Read result file

After `close-branch` returns successfully, read the return values via a result file at `$MAIN_REPO/.close-branch-result`. Bash `export` is scoped to its subprocess and is not visible across `Skill`-tool invocation boundaries, so return values flow via a shell-sourceable `KEY='VALUE'` file:

```
INTEGRATION_SHA='<sha>'
INTEGRATION_SUMMARY='<one-line summary>'
```

```bash
INTEGRATION_SHA=""
INTEGRATION_SUMMARY=""
if [ -f "$MAIN_REPO/.close-branch-result" ]; then
  # shellcheck disable=SC1091
  source "$MAIN_REPO/.close-branch-result"
  rm -f "$MAIN_REPO/.close-branch-result"
fi
```

If the file is absent (e.g., `close-branch` succeeded but did not produce a landed SHA — PR-pending workflows), both values are empty. Stale-parent labeling skips; the final message falls back to a generic line.

`.close-branch-result` is gitignored.

## Step 3.5: Label In-Review children that built on pre-amendment content

Ralph v2 dispatches multi-level DAGs: parent `A` may still be In Review when child `B` (whose `blocked-by` is `A`) is already being built. If `A` gets amended during review and then lands via this ritual, any In-Review child `B` that was dispatched before the amendments is structurally stale — the reviewer signed off on `B` against a base that no longer exists.

This step detects that at `A`'s close time (when amendments have canonically landed) and labels each stale child with `$RALPH_STALE_PARENT_LABEL` plus a Linear comment explaining the divergence. Non-fatal: any failure is recorded in a warning array printed immediately — the landing has already happened, so the labeling is observational, not a merge-safety gate. The ordering guardrail in Pre-flight §2 (ENG-207) prevents child branches from landing un-reviewed; this step surfaces the review-integrity gap that guardrail cannot address.

Numbered 3.5 to preserve continuity with the old `/close-feature-branch` step numbering and operator muscle memory.

**Skip entirely if `$INTEGRATION_SHA` is empty.** Projects whose `close-branch` doesn't yet produce a landed SHA (PR-pending, multi-branch cascade with a later merge step) don't have a canonical parent HEAD to compare against; labeling against `HEAD` would be wrong.

```bash
WARN=()

if [ -z "$INTEGRATION_SHA" ]; then
  :  # No landed SHA — close-branch is PR-pending or similar; skip stale-parent.
else
  A_SHA="$INTEGRATION_SHA"
  A_SHORT=$(git rev-parse --short "$A_SHA")

  # Verify the workspace-scoped stale-parent label exists BEFORE touching any
  # children. Linear's `issue update --label` silently no-ops on a nonexistent
  # or team-scoped name, which would otherwise let Step 3.5 increment the
  # "labeled N children" counter against ghosts. ENG-227 plumbed the same check
  # for ralph-start; this skill doesn't run that preflight, so we gate here
  # once per close event.
  label_rc=0
  linear_label_exists "$RALPH_STALE_PARENT_LABEL" || label_rc=$?
  if [ "$label_rc" -ne 0 ]; then
    case "$label_rc" in
      1) WARN+=("workspace label $RALPH_STALE_PARENT_LABEL does not exist — skipping stale-parent check (see ralph-start SKILL.md Prerequisites)") ;;
      *) WARN+=("could not verify workspace label $RALPH_STALE_PARENT_LABEL exists — skipping stale-parent check") ;;
    esac
    blocks_json='[]'
  else
    blocks_json=$(linear_get_issue_blocks "$ISSUE_ID") || {
      WARN+=("could not query outgoing blocks relations for $ISSUE_ID; skipping stale-parent check")
      blocks_json='[]'
    }
  fi

  # Walk children currently in the configured review state. `blocked-by`
  # descendants further down the chain (C → B → A) are not examined here — C
  # will be evaluated at B's close. One level per close event keeps the
  # propagation aligned with actual close events.
  #
  # Shape-guard the helper's output with the same pattern as Pre-flight §2.
  # A null .state or .id in any entry means Linear returned a relation whose
  # `relatedIssue` failed to resolve (schema drift, permission hide, deleted
  # target). Silently dropping such entries would miss genuinely stale
  # children; instead, stop here and let the operator investigate.
  children=$(printf '%s' "$blocks_json" | jq -r --arg review "$RALPH_REVIEW_STATE" '
    if type == "array" and all(.[]; has("id") and has("state") and .id != null and .state != null) then
      .[] | select(.state == $review) | .id
    else
      error("linear_get_issue_blocks returned unexpected JSON shape (null id/state)")
    end
  ') || {
    WARN+=("linear_get_issue_blocks returned malformed entries for $ISSUE_ID; skipping stale-parent check")
    children=""
  }

  # Comment-first, label-second: the comment explains WHY the label was applied.
  # If comment posting fails we skip the label (harmless state: no comment,
  # no label). If the label application fails after a successful comment, the
  # warning names that specific failure so the operator can apply the label
  # manually — rather than being left guessing from a generic "label+comment
  # failed" message. Returns:
  #   0 — both succeeded (child is both commented and labeled)
  #   1 — comment failed (nothing applied; safe to skip labeling)
  #   2 — comment succeeded but label failed (partial: comment exists, label missing)
  stale_label_and_comment() {
    local child_id="$1" child_branch="$2" parent_id="$3" parent_sha="$4" parent_short="$5"
    local commits count truncated body
    commits=$(list_commits_ahead "$parent_sha" "refs/heads/$child_branch") \
      || { printf 'list_commits_ahead failed for %s\n' "$child_id" >&2; return 1; }
    count=$(printf '%s\n' "$commits" | grep -c . || true)
    truncated=""
    if [ "$count" -gt 50 ]; then
      commits=$(printf '%s\n' "$commits" | head -50)
      truncated=$(printf '\n(%d more)' "$((count - 50))")
    fi

    # Base-branch-agnostic wording — close-issue is global and doesn't know
    # the project's integration branch name. The child's reviewer can infer
    # from the parent issue's close comment or project convention.
    body=$(cat <<COMMENT
**Stale-parent check** — parent \`${parent_id}\` closed at \`${parent_short}\`.

This branch (\`${child_branch}\`) was dispatched before \`${parent_id}\`'s review amendments landed. The parent's final HEAD is not an ancestor of this branch, so the review signed off on pre-amendment content.

Commits on the parent not present on this branch:

\`\`\`
${commits}${truncated}
\`\`\`

Recommended: rebase this branch onto the landed parent before final review. If the divergence is a pure rebase (content identical, SHAs differ), dismiss the label manually. If this branch has its own In-Progress/In-Review descendants, rebasing here cascades to them.
COMMENT
)

    linear_comment "$child_id" "$body" || return 1
    linear_add_label "$child_id" "$RALPH_STALE_PARENT_LABEL" || return 2
  }

  stale_count=0
  while IFS= read -r child_id; do
    [ -z "$child_id" ] && continue

    resolve_rc=0
    child_branch=$(resolve_branch_for_issue "$child_id" 2>/dev/null) || resolve_rc=$?
    if [ "$resolve_rc" -ne 0 ]; then
      child_slug=$(printf '%s' "$child_id" | tr '[:upper:]' '[:lower:]')
      case "$resolve_rc" in
        1) WARN+=("$child_id: no local branch matching ${child_slug}-* — cannot verify freshness (skipped)") ;;
        2) WARN+=("$child_id: multiple local branches match ${child_slug}-* — ambiguous, cannot verify freshness (skipped)") ;;
      esac
      continue
    fi

    # `|| rc=$?` captures the rc without triggering errexit in callers that
    # have it on — same pattern as preflight_labels.sh.
    fresh_rc=0
    is_branch_fresh_vs_sha "$A_SHA" "refs/heads/$child_branch" || fresh_rc=$?
    case "$fresh_rc" in
      0) ;;
      1) apply_rc=0
         stale_label_and_comment "$child_id" "$child_branch" "$ISSUE_ID" "$A_SHA" "$A_SHORT" || apply_rc=$?
         case "$apply_rc" in
           0) stale_count=$((stale_count + 1)) ;;
           1) WARN+=("$child_id: stale parent detected but comment-post failed (no label applied)") ;;
           2) WARN+=("$child_id: stale parent detected; comment posted but label application failed (apply $RALPH_STALE_PARENT_LABEL manually)") ;;
         esac
         ;;
      2) WARN+=("$child_id ($child_branch): ancestry lookup failed")
         ;;
    esac
  done <<< "$children"

  [ "$stale_count" -gt 0 ] && WARN+=("applied $RALPH_STALE_PARENT_LABEL label to $stale_count child(ren)")
fi

# Emit accumulated notes immediately so Linear mutations performed here are
# always visible to the operator, even if a later step aborts the ritual.
if [ "${#WARN[@]}" -gt 0 ]; then
  printf '\n⚠️  Step 3.5 notes:\n'
  printf '  - %s\n' "${WARN[@]}"
fi
```

**Known limitations.** SHA-ancestry flags a child as stale even if the parent's amendment was a pure rebase with content unchanged — the operator dismisses the label manually. No auto-rebase of stale children; the operator decides whether to rebase and re-review, accept the review gap, or reopen review. Projects that override ralph's default branch naming see the helper gracefully skip each child via the "no local branch matching slug" WARN path.

## Step 6: Move Linear issue to Done

Invoke the `linear-workflow` skill with the explicit issue ID (`$ISSUE_ID`), requesting the `In Review → Done` transition. Passing the ID explicitly is required — by this point, the feature branch is gone, so `linear-workflow` cannot infer the target issue from the current branch context. Do NOT call the `linear` CLI directly.

## Step 7: Reap the worktree's codex broker, then remove the worktree

Last step. CWD is the main checkout, so worktree removal no longer threatens the session. Keeping it last means that if removal fails (dirty worktree, process holding files), the high-value state transitions — merge, push, branch delete, Linear Done — have already been applied cleanly.

**Reap first, then remove.** The codex plugin spawns an `app-server-broker.mjs` daemon per Claude Code session, scoped to that session's CWD. The broker only shuts down when `SessionEnd` fires cleanly — crashes, force-closes, or SIGKILL'd sessions leave it orphaned. `git worktree remove` doesn't notify the broker and the broker has no watchdog, so these leak until reaped. The upstream fix is an idle timeout / cwd watchdog in the plugin (tracked at <https://github.com/openai/codex-plugin-cc/issues/163?issue=openai%7Ccodex-plugin-cc%7C193>); delete this reap block once that ships.

Safety filter, three layers:

1. **`--cwd` exact match** (canonicalized via `pwd -P`) — only brokers rooted in this worktree.
2. **No live non-broker process rooted in the worktree** — catches any separate Claude Code session still active there (another terminal, IDE extension).
3. **SIGTERM, not SIGKILL** — lets the broker run its shutdown handler and cascade-stop its children.

```bash
# Canonicalize for reliable comparison (handles symlinks, trailing slashes).
WORKTREE_REAL=$(cd "$WORKTREE_PATH" && pwd -P)

# Layer 2 gate: any non-broker process whose cwd is at or below the worktree?
live_holders=$(
  lsof -a -d cwd -Fpn 2>/dev/null | awk -v w="$WORKTREE_REAL" '
    /^p/ { pid = substr($0, 2) }
    /^n/ { path = substr($0, 2); if (path == w || index(path, w"/") == 1) print pid }
  ' | sort -u | while read -r pid; do
    cmd=$(ps -p "$pid" -o command= 2>/dev/null)
    # Leading-paren patterns dodge the bash 3.2 parser bug with `case` in $(...).
    # The broker trio (broker.mjs + node codex wrapper + native codex binary)
    # all inherit the broker's cwd, so all three are reap targets, not blockers.
    case "$cmd" in
      (*app-server-broker.mjs*) ;;
      (*codex\ app-server*) ;;
      ('') ;;                       # process vanished between lsof and ps
      (*) printf '  %s %s\n' "$pid" "$cmd" ;;
    esac
  done
)

if [ -n "$live_holders" ]; then
  echo "WARNING: live processes rooted in $WORKTREE_REAL — skipping codex broker reap" >&2
  printf '%s\n' "$live_holders" >&2
else
  # Layer 1: brokers whose --cwd canonicalizes to our worktree.
  ps ax -o pid=,command= | grep 'app-server-broker\.mjs' | grep -v grep | \
    while read -r pid rest; do
      cwd=$(printf '%s\n' "$rest" | sed -n 's/.*--cwd \([^ ]*\).*/\1/p')
      [ -z "$cwd" ] && continue
      cwd_real=$(cd "$cwd" 2>/dev/null && pwd -P) || continue
      [ "$cwd_real" = "$WORKTREE_REAL" ] || continue
      echo "reaping codex broker $pid (cwd: $cwd_real)"
      kill -TERM "$pid" 2>/dev/null || true
    done
fi

git worktree remove "$WORKTREE_PATH"
```

**If removal fails:** Do NOT use `--force`. Check for:
- Uncommitted changes that slipped past pre-flight
- Untracked files that the pre-flight missed
- An editor or other process holding files open in the worktree
- A shell `cd`'d into the worktree

`--force` has destroyed work before; the failure is informational, not an obstacle to blast through.

## Final message

Print `$INTEGRATION_SUMMARY` if set (e.g., `merged to main @ abc1234 and pushed`, `PR opened: https://…`). Otherwise, a generic line:

```
$ISSUE_ID closed.
```

## Red Flags / When to Stop

- **Issue state is not `$RALPH_REVIEW_STATE`.** See Pre-flight §1 for the disposition map.
- **A `blocked-by` parent is not Done.** See Pre-flight §2. No `--force` override — the supported fix is to remove the Linear relation if the dependency has been resolved externally.
- **`close-branch` exits non-zero.** Stop. Do NOT run the Linear Done transition, stale-parent labeling, or worktree removal. The operator decides recovery from `close-branch`'s stderr diagnostic.
- **Branch not resolvable from issue ID.** Stop — the naming convention has drifted, or the branch is gone. Investigate before re-running.
- **`git worktree remove` fails.** Do NOT use `--force`. Diagnose the underlying cause.

## Portability

For a different project X to use `/close-issue`, X must:

1. Have `ralph-start` installed globally at `~/.claude/skills/ralph-start/` (this skill sources its libs from there).
2. Provide a skill named exactly `close-branch` at its `.claude/skills/close-branch/`. The name is part of the contract; this skill invokes `Skill(close-branch)` without a discovery step.
3. Use ralph's worktree + Linear-lowercase-slug branch convention (ralph-workflow invariants).
4. Have `$RALPH_FAILED_LABEL` and `$RALPH_STALE_PARENT_LABEL` set up in its Linear workspace.

If X's `close-branch` leaves `$INTEGRATION_SHA` empty (e.g., opens a PR and doesn't merge), stale-parent labeling skips entirely — no breakage. Linear Done still transitions, and the final message uses whatever `$INTEGRATION_SUMMARY` X's `close-branch` provided.
