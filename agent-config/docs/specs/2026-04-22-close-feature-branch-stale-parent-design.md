# close-feature-branch: stale-parent labeling for In-Review children

Design spec for ENG-208.

## Context

Ralph v2 dispatches multi-level DAGs: parent issue A is still In Review when child B is already being built (B's `blocked-by` is A). If A is amended during review and then merged to main, any In-Review child B that was dispatched before the amendments is structurally stale — the reviewer signed off on B's content against a base that no longer exists.

The ordering-guardrail shipped as ENG-207 prevents B from closing before A is Done, which keeps un-reviewed content off main. It does not address the **review-integrity gap**: B's review sign-off is now based on pre-amendment content of A, and the reviewer is unaware.

**Detection at A's close time** is the right moment. A's final HEAD is known; any In-Review child built on an earlier version is structurally stale from that moment forward. This is the idea originally proposed by the canceled ENG-185 (git-hook-based) and ENG-198 (warn-at-close B), moved to A's close so it fires once per amendment, reuses the existing skill, and labels rather than blocks.

## Non-goals

- No auto-rebase of stale children. Operator decides whether to rebase and re-review, dismiss as a pure-rebase false positive, or defer.
- No auto-removal of the label. Operator or the child's own close resolves it.
- No recursive DAG walk. Grandchildren propagate naturally through the close-ritual chain (see "Propagation" below).
- No content-based ancestry (`git cherry` / patch-id). SHA-ancestry is the v1 check; the false-positive case is accepted (see Known Limitations).
- Not triggered by arbitrary commits — only at A's close, when amendments have canonically "landed."

## Propagation

The detection is local to each close event, but staleness propagates across a chain as closes happen.

Consider `main → A → B → C`, where A is amended during review.

1. **At A's close** — ENG-208 labels B. C is not examined (C's `blocked-by` is B, not A). C is structurally also at risk, but we don't label it here.
2. **Operator response** — rebase B onto main (picking up A_v2), or accept the review-gap and close B anyway, or reopen review. The spec deliberately does not prescribe.
3. **At B's close** — the same Step 3.5 check fires. B's post-rebase HEAD includes A_v2's commits; C's HEAD is on pre-rebase B. `git merge-base --is-ancestor B_new C` → not an ancestor → C is labeled `stale-parent`. Propagation complete for this chain.

This one-level-at-a-time model keeps the check simple and keeps the labeling sync with actual close events. The **rebase cost** still cascades — rebasing B forces a subsequent rebase of C onto new B. The operator is warned of this via the comment body (see Output Formats) but the skill does not compute or enumerate the cascade. ENG-225 tracks broader research into chained-MR workflows (Gerrit, Graphite, stacked-diff tools) that may supersede this model.

## Prerequisites

- The Linear label named by `stale_parent_label` in `agent-config/skills/ralph-start/config.json` (default: `stale-parent`) exists at workspace level. The default label has already been created (workspace-scoped, color `#F2994A`, grouped under `Workflow`).
  - If missing on first run, the `linear_add_label` call will surface a diagnostic; the spec documents this as setup, not a code concern.
- Linear `blocked-by` relations: **ENG-184** (Done) is preserved as a historical blocker — it was the "ralph v2 live" pickup gate, now satisfied. No unresolved prerequisites remain. ENG-207 (companion ordering-guardrail) is already Done; ENG-213 (skill split) is deliberately not a blocker — ENG-208 lands on the current single-skill and its helpers relocate cleanly when ENG-213 picks up.

## Architecture

### Integration point

A new step in `.claude/skills/close-feature-branch/SKILL.md`, inserted between the current **Step 3 (Push)** and **Step 4 (Detach HEAD in the worktree)**, numbered **Step 3.5** to avoid cascading renumbering in diffs.

Why between 3 and 4:

- After Step 3, A's final HEAD is what we just pushed to origin/main — the canonical comparison SHA.
- Before Step 4/5, A's local branch ref and worktree still exist (not strictly needed because we use `$A_SHA` directly, but keeps the check before anything destructive happens).

The step is **non-fatal**. Any failure (Linear API, missing local branch, label rejection) is logged to a warning array. The close itself continues — the push has already landed and the labeling is observational, not a merge-safety gate. At the end of the ritual, if the warning array is non-empty, a `⚠️ Post-close notes:` banner prints each warning.

### Configurable label name

The label name is parameterized via `agent-config/skills/ralph-start/config.json`, mirroring the existing `failed_label` / `$RALPH_FAILED_LABEL` pattern used by the orchestrator.

- New config key: `stale_parent_label` in both `config.json` and `config.example.json`, default value `"stale-parent"`.
- New entry in `agent-config/skills/ralph-start/scripts/lib/config.sh`'s `keys` array: `"RALPH_STALE_PARENT_LABEL:stale_parent_label"`. The loader enforces all keys in this array as required, so adding it here is sufficient — missing from a user-customized `config.json` fails loudly on load.
- `.claude/skills/close-feature-branch/SKILL.md` sources `config.sh` alongside the existing `linear.sh` source in Pre-flight §2, so Step 3.5 sees `$RALPH_STALE_PARENT_LABEL` (and, as a side effect, all other `RALPH_*` exports). The shared loader is preferred over inline jq for one-key parity with the orchestrator and to keep validation (missing key, malformed JSON, `.ralph.json` shape) in one place.
- `agent-config/skills/ralph-start/SKILL.md`'s Prerequisites section enumerates required `config.json` keys; `stale_parent_label` is added there.
- `agent-config/skills/ralph-start/scripts/test/config.bats`'s "valid config exports all workflow RALPH_* vars" fixture (the `expected` array) gains `RALPH_STALE_PARENT_LABEL=stale-parent`.

Rationale: operators who rename the label in Linear (team convention, color scheme, namespace collision) change one config value rather than patching the skill. Matches the existing `failed_label` symmetry and keeps the label-name source-of-truth in config.

### New helpers

All new code lands under `agent-config/skills/ralph-start/scripts/lib/`. This directory is already sourced by `close-feature-branch` for `linear_get_issue_blockers`; co-locating is consistent with current structure. A leading comment in each new file notes that when the ralph workflow skills consolidate into a plugin, these helpers should relocate with the rest of the shared plumbing — the current location is pragmatic, not principled.

#### `linear.sh` — additions

```
linear_get_issue_blocks <issue-id>
  → stdout: JSON array [{id, state, branch, project}, ...], one entry per outgoing `blocks` relation
  → exit 0 on success
  → non-zero on: API failure, shape mismatch, pagination truncation (>250)
```

Mirrors `linear_get_issue_blockers` structurally. Key differences:

- GraphQL field is `issue.relations(first:250)` (outgoing) rather than `inverseRelations`.
- Client-side filter is still `select(.type == "blocks")`.
- Output JSON shape is identical to `linear_get_issue_blockers`, so callers can consume either helper with the same `jq` pipelines.
- Same fail-loud convention on pagination and shape drift.

Docstring points at ENG-208 as the motivating consumer and notes the symmetry with `linear_get_issue_blockers`.

#### New file `branch_ancestry.sh`

Pure git, no Linear dependency. Three helpers:

```
is_branch_fresh_vs_sha <parent_sha> <branch_ref>
  → exit 0 if parent_sha is reachable from branch_ref (fresh)
  → exit 1 if parent_sha is NOT an ancestor (stale)
  → exit 2 on lookup failure (invalid sha, missing ref)

  Implementation: wraps `git merge-base --is-ancestor "$parent_sha" "$branch_ref"`,
  which exits 0 (is-ancestor) or 1 (not-ancestor) on valid inputs, 128 or other
  nonzero on bad inputs. The helper normalizes any non-{0,1} exit to 2 and writes
  a diagnostic to stderr.

list_commits_ahead <parent_sha> <branch_ref>
  → stdout: `git log --oneline <branch_ref>..<parent_sha>` (commits reachable from parent but not from branch)
  → exit 0 on success, non-zero on lookup failure

resolve_branch_for_issue <issue-id>
  → stdout: branch name
  → exit 0 if a unique local branch matches `${SLUG}-*`
  → exit 1 if zero or multiple matches (stderr diagnostic on each)
```

The pre-flight block at the top of the current `SKILL.md` duplicates the resolve-branch logic inline. That block is refactored to call `resolve_branch_for_issue "$ISSUE_ID"` so the lookup lives in one place. The skill retains the Linear-branchName fallback inline in the pre-flight if the helper reports zero matches — the fallback is a one-shot safety net specific to the main issue being closed, not generic to every child lookup.

### Data flow — Step 3.5

```
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/branch_ancestry.sh"
# linear.sh and config.sh are already sourced from Pre-flight §2; config.sh
# exports $RALPH_STALE_PARENT_LABEL (see "Configurable label name" above).

A_SHA=$(git rev-parse HEAD)
A_SHORT=$(git rev-parse --short HEAD)
WARN=()

blocks_json=$(linear_get_issue_blocks "$ISSUE_ID") || {
  WARN+=("could not query outgoing blocks relations for $ISSUE_ID; skipping stale-parent check")
  blocks_json='[]'
}

# Emit one child id per In-Review child. We resolve each branch locally via
# resolve_branch_for_issue rather than trusting Linear's branchName, to match
# how the pre-flight resolves the main issue's branch.
children=$(printf '%s' "$blocks_json" \
  | jq -r '.[] | select(.state == "In Review") | .id')

stale_count=0
while IFS= read -r child_id; do
  [ -z "$child_id" ] && continue

  if ! child_branch=$(resolve_branch_for_issue "$child_id"); then
    child_slug=$(printf '%s' "$child_id" | tr '[:upper:]' '[:lower:]')
    WARN+=("$child_id: no local branch matching ${child_slug}-* — cannot verify freshness (skipped)")
    continue
  fi

  is_branch_fresh_vs_sha "$A_SHA" "refs/heads/$child_branch"
  case $? in
    0) ;;  # fresh
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

`stale_label_and_comment` is a small in-skill function (not a lib helper — it's orchestration-specific):

```
stale_label_and_comment <child_id> <child_branch> <parent_id> <parent_sha> <parent_short>:
  commits=$(list_commits_ahead "$parent_sha" "refs/heads/$child_branch") \
    || { printf 'list_commits_ahead failed for %s\n' "$child_id" >&2; return 1; }
  count=$(printf '%s\n' "$commits" | grep -c . || true)
  truncated=""
  if [ "$count" -gt 50 ]; then
    commits=$(printf '%s\n' "$commits" | head -50)
    truncated=$(printf '\n(%d more)' "$((count - 50))")
  fi

  # Heredoc builds the comment body with concrete values substituted in.
  # $ISSUE_ID here is the parent being closed — passed explicitly as
  # $parent_id to avoid relying on caller-scope globals.
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
  # linear_comment takes the body as its second arg; if the body contains
  # markdown backticks or special chars, pass via --body-file per linear.sh
  # patterns elsewhere. For v1 the backticks are fine through --body.
  linear_comment "$child_id" "$body" || return 1
```

The warning banner is printed at the very end of the ritual, after Step 7 (worktree removal), regardless of whether earlier non-fatal steps logged failures — so the operator sees every warning without having to scroll.

## Output formats

### Linear comment body (one per stale child)

```
**Stale-parent check** — parent `ENG-XXX` closed at `<A_SHORT>`.

This branch (`<child_branch>`) was dispatched before `ENG-XXX`'s review amendments landed. The parent's final HEAD is not an ancestor of this branch, so the review signed off on pre-amendment content.

Commits on the parent not present on this branch:

\`\`\`
<git log --oneline child..A_SHA, capped at 50 lines>
(N more)   # only if truncated
\`\`\`

Recommended: rebase this branch onto `main` before final review. If the divergence is a pure rebase (content identical, SHAs differ), dismiss the label manually. If this branch has its own In-Progress/In-Review descendants, rebasing here cascades to them.
```

`main` is hard-coded in this comment — consistent with `close-feature-branch` being project-local and knowing its own base branch name. Other projects adopting this skill would adjust the literal.

### End-of-ritual warning banner

After Step 7, if `WARN` is non-empty:

```
⚠️  Post-close notes:
  - <warning 1>
  - <warning 2>
  ...
```

## Testing

### In-scope for bats tests

New file `agent-config/skills/ralph-start/scripts/test/branch_ancestry.bats`. Fixture pattern matches existing bats tests in the same directory (see `build_queue.bats`, `dag_base.bats` for style and `setup()` / `teardown()` conventions). Each test creates a temp git repo with controlled topology; `teardown()` removes the temp dir.

**Assertion convention:** `if [[ ... ]]; then return 1; fi` — never bare `[[ ]]`, which is a no-op inside bats (per repo convention).

Cases:

- **`is_branch_fresh_vs_sha`**
  - parent_sha on direct ancestor line of branch_ref → exit 0
  - parent_sha diverged (amended on the parent's branch after branch_ref forked) → exit 1
  - bad parent_sha → exit 2, diagnostic on stderr
  - missing branch_ref → exit 2, diagnostic on stderr
- **`list_commits_ahead`**
  - three commits on parent beyond the fork point → exactly three lines on stdout, exit 0
  - parent_sha == branch_ref tip → empty stdout, exit 0
  - bad sha or missing ref → non-zero exit
- **`resolve_branch_for_issue`**
  - unique local branch `eng-123-foo` with `ISSUE_ID=ENG-123` → outputs `eng-123-foo`, exit 0
  - two branches matching `eng-123-*` → exit 1, diagnostic listing both on stderr
  - no match → exit 1, diagnostic on stderr

### Out of scope for bats tests

- `linear_get_issue_blocks` — not unit-tested; mirrors the existing `linear_get_issue_blockers` convention (validated live via the orchestrator and now via ENG-208's use at close time). Mocking `linear api` is brittle and a separate decision.
- The Step 3.5 orchestration block in `SKILL.md` — not unit-tested. The lib helpers it calls are tested; the glue is thin enough that manual verification on the first multi-level DAG amendment in practice is the intended validation.

## Known limitations

1. **Pure-rebase false positives.** SHA-ancestry flags a child as stale even if the parent's amendment was a pure rebase with identical content. Operator dismisses the label manually. Content-based check (`git cherry` / patch-id) is a viable v2 if this becomes noisy in practice.
2. **`main`-literal in the comment body.** Matches the skill's chezmoi-scope. Post-ENG-213 split (global `close-issue` + project-local `close-branch`), the base-branch name would be parameterized from the project-local piece. Documented; not blocking.
3. **Cascade cost not auto-computed.** Rebasing a stale child cascades to its own In-Review descendants. The comment warns but does not enumerate. ENG-225 tracks broader chained-MR research that may supersede this whole model.
4. **Cross-machine dispatches.** If a child's local branch is missing (e.g., dispatched from another machine), the skill warns and skips — no label applied. Acceptable because chezmoi's workflow is single-machine today.
5. **close-feature-branch does not yet source the shared label preflight.** The label named by `stale_parent_label` in config (default `stale-parent`, already created workspace-scoped) must exist in Linear as a one-time setup. ENG-227 shipped `agent-config/skills/ralph-start/scripts/lib/preflight_labels.sh`, which verifies every configured workflow label (both `failed_label` and `stale_parent_label`, skipping unset slots) at ralph-start's preflight. Close-feature-branch's Step 3.5 can source that same helper to close this gap; this spec's implementation did not yet wire it up, so in the interim a missing label surfaces via `linear_add_label`'s warning banner at close-time.

## Implementation checklist (for the autonomous session)

1. Plumb the `stale_parent_label` config key:
   - Add `"stale_parent_label": "stale-parent"` to `agent-config/skills/ralph-start/config.json` and `config.example.json`.
   - Add `"RALPH_STALE_PARENT_LABEL:stale_parent_label"` to the `keys` array in `agent-config/skills/ralph-start/scripts/lib/config.sh`.
   - Add `stale_parent_label` to the required-keys enumeration in `agent-config/skills/ralph-start/SKILL.md`'s Prerequisites section.
   - Add `RALPH_STALE_PARENT_LABEL=stale-parent` to the `expected` array in the `@test "valid config exports all workflow RALPH_* vars with correct values"` test in `agent-config/skills/ralph-start/scripts/test/config.bats`.
2. Add `linear_get_issue_blocks` to `agent-config/skills/ralph-start/scripts/lib/linear.sh` following the pattern and docstring style of `linear_get_issue_blockers`.
3. Create `agent-config/skills/ralph-start/scripts/lib/branch_ancestry.sh` with `is_branch_fresh_vs_sha`, `list_commits_ahead`, and `resolve_branch_for_issue`. Top-of-file comment notes the pragmatic-location / future-plugin-move.
4. Refactor the existing pre-flight branch resolution in `.claude/skills/close-feature-branch/SKILL.md` to call `resolve_branch_for_issue`, keeping the Linear-branchName fallback inline for the main issue. In the same Pre-flight §2 block, add `source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/config.sh" "${RALPH_CONFIG:-$HOME/.claude/skills/ralph-start/config.json}"` alongside the existing `linear.sh` source so Step 3.5 sees `$RALPH_STALE_PARENT_LABEL`.
5. Add Step 3.5 to the same `SKILL.md`, including the `stale_label_and_comment` helper function (using `$RALPH_STALE_PARENT_LABEL` rather than the literal), warning array, and end-of-ritual banner.
6. Add `agent-config/skills/ralph-start/scripts/test/branch_ancestry.bats` covering the three cases per helper listed above.
7. Update the skill's "Red Flags / When to Stop" and "Explicitly out of scope" sections if any new edge cases surface during implementation.
8. Verify bats tests pass locally. Commit helpers + skill changes + tests together.

## References

- **ENG-207** (Done) — ordering-guardrail companion; refuses to close when blockers aren't Done.
- **ENG-198** (Canceled) — B-side warn-at-close; superseded by detection at A's close.
- **ENG-185** (Canceled) — original git-hook approach; same detection, different trigger.
- **ENG-213** (Backlog) — split of `close-feature-branch` into global `close-issue` + project-local `close-branch`. These helpers relocate with the Linear-side logic when it picks up.
- **ENG-225** (filed with this spec) — chained-MR / stacked-diff research for cascade handling.
- **ENG-227** (filed with this spec) — `ralph-failed` label parallel setup gap.
- `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md` — Decision 7, Follow-up #5 (stale-parent idea origin).
- `agent-config/skills/ralph-start/scripts/lib/linear.sh` — existing library; `linear_get_issue_blockers` is the mirror of the new `linear_get_issue_blocks`.
- `.claude/skills/close-feature-branch/SKILL.md` — target of the new Step 3.5.
