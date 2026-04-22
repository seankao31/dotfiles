---
name: close-feature-branch
description: Project-local skill for chezmoi/agent-config. Use when the user has finished reviewing a feature branch and is ready to ship — runs rebase, fast-forward merge to main, push, branch deletion, Linear Done transition, and worktree removal. Invoke from the main-checkout CWD with the Linear issue ID as an argument (e.g. `/close-feature-branch ENG-197`). NOT for multi-branch cascades (dev/staging/main) — this repo is main-only. NOT a replacement for prepare-for-review; that skill runs earlier to produce the review artifacts.
argument-hint: <issue-id>
model: sonnet
allowed-tools: Skill, Bash, Read, Glob, Grep
---

# Close Feature Branch (chezmoi)

The merge-and-cleanup ritual for this repo, run AFTER the user has reviewed the work. This skill is explicitly NOT for doing tests, code review, docs, or decision captures — those belong in `/prepare-for-review`, which runs earlier in the lifecycle.

## When to Use

- After the user has reviewed an In Review Linear issue and approved the work for merge.
- On a feature branch in a worktree under `.worktrees/` (created by `using-git-worktrees` or the ralph orchestrator).

## Invocation

Invoke from the **main-checkout CWD** (repo root, `/Users/seankao/.local/share/chezmoi`) with the Linear issue ID as the only argument:

```
/close-feature-branch ENG-197
```

Running from inside the worktree being closed used to be the norm, but it pinned the Bash tool's session CWD to that worktree — any external cause (another process, stray `rm`, hook) that removed the directory mid-ritual killed the session instantly. Invoking from the main checkout removes that failure class entirely: the CWD is stable throughout, and all worktree-side git ops use `git -C "$WORKTREE_PATH" …`.

## Capture branch identity up front

The agent receives the issue ID as the invocation argument and exposes it as `$ISSUE_ID`. If the argument is missing, stop and ask the user for it.

From there, validate the invocation location and resolve the feature branch and its worktree:

```bash
# 1. Verify CWD is the main checkout, not a linked worktree.
#    In a main checkout, .git is a directory; in a linked worktree, .git is a file.
MAIN_REPO=$(git rev-parse --show-toplevel)
if [ -f "$MAIN_REPO/.git" ]; then
  echo "Error: must be invoked from the main checkout, not a linked worktree." >&2
  echo "Detected worktree root at: $MAIN_REPO" >&2
  exit 1
fi

# 2. Resolve the feature branch from the issue ID via the shared ancestry helper.
#    Linear's branch-name convention is lowercase `<issue-id>-<slug>`.
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/branch_ancestry.sh"

resolve_rc=0
FEATURE_BRANCH=$(resolve_branch_for_issue "$ISSUE_ID") || resolve_rc=$?

if [ "$resolve_rc" -eq 2 ]; then
  # Multiple matches — genuinely ambiguous. The helper has already printed
  # the candidate branches to stderr. Stop rather than silently picking one.
  exit 1
fi

if [ "$resolve_rc" -eq 1 ] || [ -z "$FEATURE_BRANCH" ]; then
  # Zero matches — fall back to Linear's canonical branchName in case the
  # local branch uses a non-standard prefix (rename, historic naming). The
  # fallback stays inline; it's a one-shot safety net for the main issue
  # being closed, not generic to every child lookup.
  FEATURE_BRANCH=$(linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.branchName // empty')
  if [ -z "$FEATURE_BRANCH" ] || ! git show-ref --verify --quiet "refs/heads/$FEATURE_BRANCH"; then
    ISSUE_SLUG=$(echo "$ISSUE_ID" | tr '[:upper:]' '[:lower:]')
    echo "Error: no local branch matches '${ISSUE_SLUG}-*', and Linear's branchName for $ISSUE_ID was not found locally." >&2
    exit 1
  fi
fi

# 3. Resolve the worktree path for that branch.
WORKTREE_PATH=$(git worktree list --porcelain | awk -v b="refs/heads/$FEATURE_BRANCH" '
  /^worktree / { path = substr($0, 10) }
  $0 == "branch " b { print path; exit }
')

if [ -z "$WORKTREE_PATH" ]; then
  echo "Error: no worktree found for branch $FEATURE_BRANCH." >&2
  exit 1
fi
```

All subsequent shell commands reference `$FEATURE_BRANCH`, `$ISSUE_ID`, `$WORKTREE_PATH`, and `$MAIN_REPO`. The CWD stays at `$MAIN_REPO` for the entire ritual — worktree-side operations use `git -C "$WORKTREE_PATH" …`.

## Pre-flight

### 1. Verify the issue is in the review state

Source `config.sh` once up front — it exports the `RALPH_*` workflow state names (including `$RALPH_REVIEW_STATE` for this step, `$RALPH_DONE_STATE` for §2, `$RALPH_STALE_PARENT_LABEL` for Step 3.5) and transitively sources `lib/linear.sh`. Idempotent across re-sources.

```bash
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/config.sh" \
  "${RALPH_CONFIG:-$MAIN_REPO/agent-config/skills/ralph-start/config.json}"

linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.state.name'
```

Expected: `$RALPH_REVIEW_STATE` (default: `In Review`; workspaces can customize via `config.json`).

- **Matches `$RALPH_REVIEW_STATE`** — proceed.
- **Matches `$RALPH_IN_PROGRESS_STATE`** — the work hasn't been handed off for review yet. Run `/prepare-for-review` first (added in ENG-182; must be merged before this skill is usable on a branch still in the in-progress state).
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
2. **Validate shape in jq.** The `type == "array" and all(...; has("id") and has("state"))` guard ensures an unexpected return shape (wrapper object, `null`, `{}`, schema drift) errors out instead of iterating to empty output. Without this, a helper contract drift to `{}` would silently pass the check.

- **Non-zero exit** — either the helper failed or its JSON didn't match the expected shape; a diagnostic is on stderr. STOP and surface to the user; the blocker set is unknown and proceeding is unsafe.
- **No output from `jq`** — no unresolved blockers; proceed.
- **Any output from `jq`** — each line is `<blocker-id>\t<state>`. STOP. Print the list and refuse to close. Tell the user: `Canceled` blockers are NOT treated as resolved (per ralph v2 Decision 6 in `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md`); the supported way to declare "this is no longer a blocker" is to remove the relation in Linear via `linear issue relation delete "$ISSUE_ID" blocked-by <blocker-id>` and re-run. No `--force` escape hatch.

Why this belongs in pre-flight: ralph v2 dispatches child branches before their parents are Done. If the child closes first, the child's branch still carries the parent's un-reviewed commits — Step 1's `git rebase main` reconciles content but doesn't know which commits belong to which issue, and Step 2's fast-forward merge then lands the parent's work on `main` as a side effect of closing the child. Guarding at the child's close time keeps the "nothing merges to main until it's been reviewed" invariant intact.

`linear_get_issue_blockers` is sourced from the ralph-start skill's library. It uses `linear api` (GraphQL) rather than text-parsing `linear issue relation list` output — see the function's docstring for rationale and pagination behavior.

### 3. Verify no uncommitted tracked-file changes in the worktree

```bash
git -C "$WORKTREE_PATH" status --short
```

- **Any line NOT starting with `??`** — uncommitted changes to tracked files (includes ` M`, `MM`, `UU`, `T`, `A`, `D`, `R`, etc.). STOP. Commit or discard them before proceeding. `git worktree remove` will refuse to clean up a dirty worktree, and `--force` has destroyed work before — never reach for it.
- **Lines starting with `??`** — untracked files. Proceed to §4, which handles them explicitly.
- **No output** — clean; proceed.

### 4. Preserve untracked files

```bash
git -C "$WORKTREE_PATH" ls-files --others --exclude-standard
```

If this lists any files, stop and ask the user what to do with each one. Options:
- Commit them (if they're part of the work that should land).
- Copy them out to a safe location (e.g., `~/ralph-handoff-artifacts/$ISSUE_ID/`) before removing the worktree.
- Explicitly discard if they're truly ephemeral.

Never silently discard untracked files. `plan.md` files have been lost this way before — the whole reason this pre-flight exists.

## The Ritual (run in order)

Working directory is the main checkout (`$MAIN_REPO`) throughout. Worktree-side operations use `git -C "$WORKTREE_PATH" …`.

### Step 1: Rebase onto latest main

```bash
git -C "$WORKTREE_PATH" fetch origin main
git -C "$WORKTREE_PATH" rebase main
```

Rebase onto **local** `main`, not `origin/main`. The user sometimes commits directly to local main (progress logs, plan tweaks) without pushing immediately; rebasing onto local main absorbs those commits so Step 2's `git merge --ff-only` succeeds. The `git fetch` is still useful — Step 2's `git pull --ff-only origin main` catches any movement on the remote before the merge.

**If rebase fails with conflicts:** resolve them yourself when the right answer is mechanical, then `git -C "$WORKTREE_PATH" add <files>` and `git -C "$WORKTREE_PATH" rebase --continue`. The skill's goal is minimal human intervention *when the decision is mechanical* — the user would rather have the skill make an obvious call than be interrupted for it.

Mechanical resolutions (resolve, don't escalate):

- Unrelated edits in adjacent regions (formatting, nearby lines, imports) — keep both.
- Same logical change landed on both sides — drop the feature-branch duplicate; take main's version.
- Both sides appended different items to the same list, changelog, or docs section — merge the content.

Abort (`git rebase --abort`) and escalate only when:

- Both sides made substantive, contradicting changes to the same logic.
- A file was deleted on one side and modified on the other.
- You genuinely can't tell what the right answer is without user context.

Silently picking a side on ambiguous logic is worse than stopping to ask — the "minimal intervention" principle applies only when the decision is obvious.

### Step 2: Fast-forward merge to main

CWD is already the main checkout. Verify it's clean (the user also uses this checkout for ad-hoc edits):

```bash
git status --short
```

If this produces any output, STOP and surface to the user. Do not merge into a dirty main checkout — a failed `git pull --ff-only` or `git merge --ff-only` can leave both the main checkout and the close ritual half-completed.

Once clean:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only "$FEATURE_BRANCH"
```

If the merge is not fast-forward (origin/main advanced between the rebase and the merge), re-run Step 1 to rebase the worktree onto the new main.

Never create a merge commit here. This repo uses rebase + ff-only as a durable convention — see user memory `feedback_rebase_merge.md`.

### Step 3: Push

Still in the main checkout:

```bash
git push origin main
```

**If the push is rejected** (someone pushed in between): local main has already absorbed the feature commits via ff-merge, so it has diverged from the new origin/main. `git pull --ff-only` won't resolve this. Recovery:

1. `git reset --hard origin/main` on the main checkout (discards the local ff-merge).
2. Re-run Step 1 (rebase the worktree onto the new origin/main).
3. Re-run Step 2 and Step 3.

Alternatively, escalate to the user if you're unsure — losing an ff-merge state is recoverable, but making it worse is harder to undo.

### Step 3.5: Label In-Review children that built on pre-amendment content

Ralph v2 dispatches multi-level DAGs: parent `A` may still be In Review when child `B` (whose `blocked-by` is `A`) is already being built. If `A` gets amended during review and then lands via this ritual, any In-Review child `B` that was dispatched before the amendments is structurally stale — the reviewer signed off on `B` against a base that no longer exists.

This step detects that at `A`'s close time (when amendments have canonically landed) and labels each stale child with `$RALPH_STALE_PARENT_LABEL` plus a Linear comment explaining the divergence. Non-fatal: any failure is recorded in a warning array printed at the end of the ritual — the push has already landed, so the labeling is observational, not a merge-safety gate. The ordering guardrail in Pre-flight §2 (ENG-207) prevents child branches from landing un-reviewed on main; this step surfaces the review-integrity gap that guardrail cannot address.

Numbered 3.5 rather than renumbering 4–7 to keep the diff small and preserve existing operator muscle-memory.

```bash
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/branch_ancestry.sh"
# config.sh + linear.sh already sourced in Pre-flight §2.

A_SHA=$(git rev-parse HEAD)
A_SHORT=$(git rev-parse --short HEAD)
# Warnings accumulate here. Printed as a banner at the very end of the ritual
# (see Step 7), so the operator sees every post-close note in one place
# regardless of which step logged it.
WARN=()

# Verify the workspace-scoped stale-parent label exists BEFORE touching any
# children. Linear's `issue update --label` silently no-ops on a nonexistent
# or team-scoped name, which would otherwise let Step 3.5 increment the
# "labeled N children" counter against ghosts. ENG-227 plumbed the same check
# for ralph-start; close-feature-branch doesn't run that preflight, so we
# gate here once per close event.
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
# propagation aligned with actual close events. The state name comes from
# $RALPH_REVIEW_STATE (sourced via config.sh in Pre-flight §2) so workspaces
# with a customized review state keep working.
children=$(printf '%s' "$blocks_json" \
  | jq -r --arg review "$RALPH_REVIEW_STATE" '.[] | select(.state == $review) | .id')

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

  # Heredoc with concrete values. `main` is hard-coded — this skill is
  # project-local and knows its base branch. After the ENG-213 split, the
  # global portion would parameterize it from the project-local piece.
  body=$(cat <<COMMENT
**Stale-parent check** — parent \`${parent_id}\` closed at \`${parent_short}\`.

This branch (\`${child_branch}\`) was dispatched before \`${parent_id}\`'s review amendments landed. The parent's final HEAD is not an ancestor of this branch, so the review signed off on pre-amendment content.

Commits on the parent not present on this branch:

\`\`\`
${commits}${truncated}
\`\`\`

Recommended: rebase this branch onto \`main\` before final review. If the divergence is a pure rebase (content identical, SHAs differ), dismiss the label manually. If this branch has its own In-Progress/In-Review descendants, rebasing here cascades to them.
COMMENT
)

  linear_add_label "$child_id" "$RALPH_STALE_PARENT_LABEL" || return 1
  linear_comment "$child_id" "$body" || return 1
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
  rc=0
  is_branch_fresh_vs_sha "$A_SHA" "refs/heads/$child_branch" || rc=$?
  case "$rc" in
    0) ;;
    1) if stale_label_and_comment "$child_id" "$child_branch" "$ISSUE_ID" "$A_SHA" "$A_SHORT"; then
         stale_count=$((stale_count + 1))
       else
         WARN+=("$child_id: ancestry check said stale, but label+comment failed")
       fi
       ;;
    2) WARN+=("$child_id ($child_branch): ancestry lookup failed")
       ;;
  esac
done <<< "$children"

[ "$stale_count" -gt 0 ] && WARN+=("applied $RALPH_STALE_PARENT_LABEL label to $stale_count child(ren)")
```

**Known limitations.** SHA-ancestry flags a child as stale even if the parent's amendment was a pure rebase with content unchanged — the operator dismisses the label manually. No auto-rebase of stale children; the operator decides whether to rebase and re-review, accept the review gap, or reopen review.

### Step 4: Detach HEAD in the worktree

`git branch -d` refuses to delete a branch that is checked out in any worktree. Detach HEAD in the worktree before deleting the branch:

```bash
git -C "$WORKTREE_PATH" checkout --detach
```

The worktree directory stays intact with a detached HEAD; working files are unchanged.

### Step 5: Delete the feature branch

With the branch no longer checked out anywhere, delete it locally and on the remote:

```bash
git branch -d "$FEATURE_BRANCH"
git push origin --delete "$FEATURE_BRANCH"
```

Use `-d` (safe delete), not `-D` (force delete). If `-d` refuses because the branch isn't merged, something went wrong with the rebase/merge — investigate before escalating to `-D`.

### Step 6: Move Linear issue to Done

Invoke the `linear-workflow` skill with the explicit issue ID (`$ISSUE_ID`), requesting the `In Review → Done` transition. Passing the ID explicitly is required — by this point, the feature branch is gone, so `linear-workflow` cannot infer the target issue from the current branch context. Do NOT call the `linear` CLI directly.

### Step 7: Reap the worktree's codex broker, then remove the worktree

Last step. CWD is the main checkout, so worktree removal no longer threatens the session. Keeping it last means that if removal fails (dirty worktree, process holding files), the high-value state transitions — ff-merge, push, branch delete, Linear Done — have already been applied cleanly.

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

# Post-close notes. Any non-fatal warnings accumulated during Step 3.5 (and
# any future step that appends to `WARN`) print here, after worktree removal,
# so the operator sees them in one place at the very end of the ritual.
if [ "${#WARN[@]}" -gt 0 ]; then
  printf '\n⚠️  Post-close notes:\n'
  printf '  - %s\n' "${WARN[@]}"
fi
```

**If removal fails:** Do NOT use `--force`. Check for:
- Uncommitted changes (re-run pre-flight)
- Untracked files that the pre-flight missed
- An editor or other process holding files open in the worktree
- A shell `cd`'d into the worktree

`--force` has destroyed work before; the failure is informational, not an obstacle to blast through.

## Red Flags / When to Stop

- **Issue state is not In Review.** See Pre-flight §1 for the disposition map.
- **A `blocked-by` parent is not Done.** See Pre-flight §2. No `--force` override — the supported fix is to remove the Linear relation if the dependency has been resolved externally.
- **Rebase introduces conflicts that need user context.** Abort and escalate. Mechanical conflicts are resolved in Step 1 without escalation; only ambiguous/contradicting ones stop here.
- **`git worktree remove` fails.** Do NOT use `--force`. Diagnose the underlying cause.
- **Main has moved during the ritual.** Re-rebase and re-merge. Do NOT bridge with a merge commit — this repo's convention is rebase + ff-only.
- **`-d` refuses to delete the branch.** The branch isn't merged despite the preceding ff-only merge. Investigate rather than escalating to `-D`.

## Explicitly out of scope

Per the design doc (Decision 4 + Follow-up #6) and ENG-186 ticket:

- **Tests, code review, docs, decision captures** — belong in `/prepare-for-review`, which runs earlier.
- **Tags, release notes** — N/A for this dotfiles repo.
- **Multi-branch cascades** (dev → staging → main) — N/A; this repo is main-only.
- **Undoing a close** — if the wrong branch was closed, use git reflog to recover rather than asking this skill to "uncloseˮ.
- **Auto-rebasing stale children** (Step 3.5) — the skill labels and comments but does not rewrite the child's branch. The operator decides between rebase-and-re-review, dismiss-as-pure-rebase, or accept the gap.
- **Recursive DAG walk** (Step 3.5) — only direct `blocks` children are examined. Grandchildren propagate through the close-ritual chain as each child is itself closed.
