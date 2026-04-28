---
name: close-branch
description: Project-local VCS integration for chezmoi/agent-config. Runs rebase onto local `main`, fast-forward merge, push, HEAD detach, and branch delete for a reviewed feature branch. Invoked ONLY by the global `close-issue` skill — not a user entry point. Chezmoi specifics: base branch is `main`, direct-to-main push (no PR), `-d` (safe delete) for branch removal, rebase onto LOCAL main (not `origin/main`) to absorb unpushed direct-to-main commits.
argument-hint: <issue-id>
model: sonnet
allowed-tools: Bash, Read, Glob, Grep
user-invocable: false
---

# Close Branch (chezmoi)

The VCS integration half of the close ritual. The global `close-issue` skill handles Linear state preflight, untracked-file preservation, stale-parent labeling, the Done transition, and worktree removal; this skill handles every project-specific git decision: base branch, rebase policy, merge strategy, push model, branch-delete semantics.

## When to Use

Only via `Skill(close-branch)` invoked from `close-issue`. Never a direct user entry point.

`user-invocable: false` hides this skill from the `/` menu so a human can't accidentally type `/close-branch` instead of `/close-issue`. The description is phrased to discourage autonomous description-based auto-pick — `close-branch` should only be entered via explicit dispatch from `close-issue`.

## Inputs on entry

`close-issue` hands off three values via a file at `$MAIN_REPO/.close-branch-inputs` (single-quoted `KEY='VALUE'` format, sourceable):

- `ISSUE_ID` — Linear issue identifier (for logging).
- `FEATURE_BRANCH` — local branch name resolved by `close-issue`.
- `WORKTREE_PATH` — absolute worktree path resolved by `close-issue`.

Shell variables from `close-issue`'s Bash calls don't reliably propagate to this skill's Bash calls — each call is a fresh shell, and the spec calls out that exports don't cross Skill-tool invocation boundaries. File-based handoff is symmetric with the result-file return channel.

These preconditions are also guaranteed:

- CWD is the main checkout (`close-issue` verified `.git` is a directory).
- Linear issue is in `$RALPH_REVIEW_STATE` with all `blocked-by` parents in `$RALPH_DONE_STATE`.
- Untracked files in `$WORKTREE_PATH` have been preserved or explicitly discarded.

Source the inputs and derive `MAIN_REPO`:

```bash
MAIN_REPO=$(git rev-parse --show-toplevel)
if [ ! -f "$MAIN_REPO/.close-branch-inputs" ]; then
  echo "Error: $MAIN_REPO/.close-branch-inputs is missing — close-issue must write it before invoking close-branch." >&2
  exit 1
fi
# shellcheck disable=SC1091
source "$MAIN_REPO/.close-branch-inputs"
rm -f "$MAIN_REPO/.close-branch-inputs"

if [ -z "$ISSUE_ID" ] || [ -z "$FEATURE_BRANCH" ] || [ -z "$WORKTREE_PATH" ]; then
  echo "Error: one or more of ISSUE_ID/FEATURE_BRANCH/WORKTREE_PATH is empty after sourcing .close-branch-inputs." >&2
  exit 1
fi
```

All subsequent commands reference `$FEATURE_BRANCH`, `$ISSUE_ID`, `$WORKTREE_PATH`, and `$MAIN_REPO`. The CWD stays at `$MAIN_REPO` throughout; worktree-side operations use `git -C "$WORKTREE_PATH" …`.

## Pre-flight: no uncommitted tracked-file changes in the worktree

```bash
git -C "$WORKTREE_PATH" status --short
```

- **Any line NOT starting with `??`** — uncommitted changes to tracked files (includes ` M`, `MM`, `UU`, `T`, `A`, `D`, `R`, etc.). Exit non-zero with a diagnostic: the operator must commit or discard them before re-running. `git worktree remove` will refuse to clean up a dirty worktree, and `--force` has destroyed work before — never reach for it.
- **Lines starting with `??`** — untracked files. `close-issue` handled these before invoking us; if any remain, something's off. Exit non-zero.
- **No output** — clean; proceed.

## The Ritual (run in order)

### Step 1: Rebase onto latest main

```bash
git -C "$WORKTREE_PATH" fetch origin main
git -C "$WORKTREE_PATH" rebase main
```

Rebase onto **local** `main`, not `origin/main`. The user sometimes commits directly to local main (progress logs, plan tweaks) without pushing immediately; rebasing onto local main absorbs those commits so Step 2's `git merge --ff-only` succeeds. The `git fetch` is still useful — Step 2's `git pull --ff-only origin main` catches any movement on the remote before the merge. The Retry path in Step 3 preserves this same invariant: when a push rejection forces a rewind, it rewinds to `$PRE_MERGE_SHA` (which includes any unpushed direct-to-main commits) rather than to `origin/main` (which would orphan them).

**If rebase fails with conflicts:** resolve them yourself when the right answer is mechanical, then `git -C "$WORKTREE_PATH" add <files>` and `git -C "$WORKTREE_PATH" rebase --continue`. The goal is minimal human intervention *when the decision is mechanical*.

Mechanical resolutions (resolve, don't escalate):

- Unrelated edits in adjacent regions (formatting, nearby lines, imports) — keep both.
- Same logical change landed on both sides — drop the feature-branch duplicate; take main's version.
- Both sides appended different items to the same list, changelog, or docs section — merge the content.

Abort (`git rebase --abort`) and exit non-zero only when:

- Both sides made substantive, contradicting changes to the same logic.
- A file was deleted on one side and modified on the other.
- The right answer isn't obvious without user context.

Silently picking a side on ambiguous logic is worse than stopping — the "minimal intervention" principle applies only when the decision is obvious.

### Step 2: Fast-forward merge to main

CWD is already the main checkout. Verify it has no uncommitted tracked-file changes (the user also uses this checkout for ad-hoc edits):

```bash
git status --short --untracked-files=no
```

If this produces any output, exit non-zero. Do not merge into a dirty main checkout — a failed `git pull --ff-only` or `git merge --ff-only` can leave both the main checkout and the close ritual half-completed.

`--untracked-files=no` suppresses `??` lines so leftover ralph artifacts, stray plan drafts, or any other untracked file in the main checkout don't trip this gate. Only uncommitted changes to *tracked* files threaten a fast-forward merge.

Once clean, capture a safety ref before the merge so Step 3 can restore main if the push is rejected and retry isn't viable:

```bash
git checkout main
git pull --ff-only origin main
PRE_MERGE_SHA=$(git rev-parse main)
git merge --ff-only "$FEATURE_BRANCH"
```

If the merge is not fast-forward (origin/main advanced between the rebase and the merge), re-run Step 1 to rebase the worktree onto the new main.

Never create a merge commit here. This repo uses rebase + ff-only as a durable convention — see user memory `feedback_rebase_merge.md`.

### Step 3: Push

Still in the main checkout:

```bash
git push origin main
```

**Invariant:** this skill must not exit while local `main` is ahead of `origin/main`. A rejected push leaves local main with a fast-forward merge that origin doesn't accept — exiting here would leave the main checkout in a state where a stray `git push --force` would rewrite shared history. Two compliant exit paths:

1. **Retry path** (preferred): if a push rejection is recoverable by re-rebasing onto the new origin/main, do the full recovery here:
   1. `git fetch origin main` — a rejected push does not reliably update the local `origin/main` tracking ref. Without an explicit fetch, the subsequent reset would land on the *pre-rejection* origin/main (stale), the worktree rebase would target that stale ref, and Step 2's `git pull --ff-only` would finally advance local main — leaving the worktree branch based on an ancestor of the new HEAD and failing the ff-only merge.
   2. `git reset --hard "$PRE_MERGE_SHA"` on local main. Restores main to the state captured in Step 2 — the post-pull, pre-ff-merge tip — which includes any unpushed direct-to-main commits Sean made before invoking the close ritual. The feature commits are still reachable via `$FEATURE_BRANCH`; the unpushed direct-to-main commits are now reachable via `main` itself, not only via reflog.
   3. `git rebase origin/main` on local main. Replays any commits between `$PRE_MERGE_SHA` and the original `origin/main` (i.e., the unpushed direct-to-main commits) onto the new collaborator-pushed tip. In the common case (no unpushed commits), this is a no-op fast-forward. Conflict handling: see the paragraph beginning "If `git rebase origin/main` in substep 3 conflicts" below the numbered list.
   4. Re-run Step 1 on the worktree (rebase onto the now-fresh local main, which equals the new origin/main plus any replayed direct-to-main commits).
   5. Re-run Step 2 (capture a fresh `$PRE_MERGE_SHA`, ff-merge).
   6. Re-run the push.

   **The Retry path is bounded to a single attempt.** If the re-push in substep 6 is also rejected — a second collaborator push raced this retry — the Retry path is exhausted. Fetch the new origin tip and reset local main to match it, then exit non-zero with a diagnostic.

   ```bash
   git fetch origin main
   git reset --hard origin/main
   ```

   After this reset:

   - Local main = `origin/main` exactly. No divergence; no `git push --force` could overwrite shared commits.
   - `$FEATURE_BRANCH` still points at the substep-5 ff-merge tip, which contains both Sean's replayed direct-to-main commits (B', C' from substep 3) and the rebased feature commits (F's). Nothing is orphaned.

   Recovery: the operator re-runs `/close-issue`. Step 1's worktree rebase onto local main replays all of `$FEATURE_BRANCH`'s commits (B', C', F's) onto the new origin tip, producing fresh B'', C'', F''s in the next attempt. No work is lost; no manual cherry-picking required. This bounded-retry-then-exit-cleanly model avoids an unbounded retry loop in the rare double-race case while keeping the "no force-push hazard" invariant on every exit path.

   Note: this fallback's reset target (`origin/main`) differs from the existing Reset path's target (`$PRE_MERGE_SHA`, line 138) by design. The existing Reset path has the same divergence flaw whenever Sean has unpushed direct-to-main commits; aligning the two paths is tracked as **ENG-304** and is intentionally out of scope for ENG-257. Using `origin/main` here from the start avoids inheriting the flaw in the new code.

   **If `git rebase origin/main` in substep 3 conflicts**, apply the same conflict-handling rules as Step 1: the conflict shape here is similar — small documentation, list, or changelog collisions between two streams of work merging into main — and the same mechanical-vs-substantive distinction applies.

   Resolve mechanical conflicts inline, then `git -C "$MAIN_REPO" add <files>` and `git rebase --continue`, then proceed to substep 4. Mechanical cases are the same as Step 1: unrelated edits in adjacent regions (keep both), the same logical change landed on both sides (drop the local-only duplicate; take origin's version), both sides appended different items to the same list/changelog/docs section (merge the content).

   Abort and exit non-zero only when both sides made substantive contradicting changes to the same logic, when a file was deleted on one side and modified on the other, or when the right answer isn't obvious without operator context. On abort: `git rebase --abort` (local main lands back at `$PRE_MERGE_SHA`), then immediately `git reset --hard origin/main` to align local main with the remote before exiting. `$FEATURE_BRANCH` still points at the pre-retry ff-merge tip (containing both Sean's replayed direct-to-main commits and the rebased feature commits), so nothing is orphaned. Exit non-zero with a diagnostic. Recovery: the operator re-runs `/close-issue`; Step 1 rebases `$FEATURE_BRANCH` onto local main (now matching origin), replaying all work fresh.

2. **Reset path** (fallback if retry is not recoverable within this skill): align local main with the post-rejection origin tip and exit non-zero with a clear diagnostic:

   ```bash
   git fetch origin main
   git reset --hard origin/main
   ```

   After this reset:

   - Local main matches `origin/main` exactly. No divergence; no `git push --force` could overwrite shared commits.
   - `$FEATURE_BRANCH` ref points at the Step 1 rebase tip — which absorbed any unpushed direct-to-main commits during the original Step 1 — so both Sean's pre-ritual direct-to-main commits and the rebased feature commits remain reachable.

   Recovery: the operator re-runs `/close-issue`. Step 1's worktree rebase onto the now-fresh local main replays all of `$FEATURE_BRANCH`'s commits onto the new origin tip. No work is lost; no manual cherry-picking required.

If neither path completes cleanly, escalate to the operator — but **never exit non-zero while local main contains the feature commits and `origin/main` does not.**

### Step 4: Capture return values

Immediately after a successful push, before any cleanup:

```bash
INTEGRATION_SHA=$(git rev-parse HEAD)
INTEGRATION_SUMMARY="merged to main @ $(git rev-parse --short HEAD) and pushed"
```

### Step 5: Detach HEAD in the worktree

`git branch -d` refuses to delete a branch that is checked out in any worktree. Detach HEAD in the worktree before deleting the branch:

```bash
git -C "$WORKTREE_PATH" checkout --detach
```

The worktree directory stays intact with a detached HEAD; working files are unchanged.

### Step 6: Delete the feature branch

With the branch no longer checked out anywhere, delete it locally. Then delete it on the remote — **but only if it was ever pushed there**. Ralph-dispatched branches are built and merged without ever being pushed to `origin`; the content reaches `main` via Step 2's fast-forward merge and Step 3's push of `main`. For those branches the remote feature ref doesn't exist, and `git push origin --delete` would fail. Check with `git ls-remote` and skip the remote delete when the ref is missing.

```bash
git branch -d "$FEATURE_BRANCH"
if git ls-remote --exit-code --heads origin "$FEATURE_BRANCH" >/dev/null 2>&1; then
  git push origin --delete "$FEATURE_BRANCH"
else
  echo "remote ref for $FEATURE_BRANCH does not exist on origin — skipping remote delete (local-only branch)"
fi
```

Use `-d` (safe delete), not `-D` (force delete). If `-d` refuses because the branch isn't merged, something went wrong with the rebase/merge — exit non-zero and let the operator investigate before escalating to `-D`.

### Step 7: Write the result file

Last step on success. Write `$MAIN_REPO/.close-branch-result` with the return values; `close-issue` sources this file on return and deletes it.

Values must be single-quoted — `close-issue` uses `source` to read the file, and an unquoted `INTEGRATION_SUMMARY=merged to main @ ...` would parse as `VAR=VALUE cmd args` (env-prefix + `to` as a command), leaving the summary unset and emitting a command-not-found error. `INTEGRATION_SHA` is a hex git SHA (no quoting hazard); `INTEGRATION_SUMMARY` here has no embedded single quotes, so plain single-quoting is sufficient:

```bash
{
  printf "INTEGRATION_SHA='%s'\n" "$INTEGRATION_SHA"
  printf "INTEGRATION_SUMMARY='%s'\n" "$INTEGRATION_SUMMARY"
} > "$MAIN_REPO/.close-branch-result"
```

On failure at any earlier step, do NOT write this file. `close-issue` treats an absent file as empty values, which correctly skips stale-parent labeling and falls back to a generic final message.

`.close-branch-result` is gitignored at the repo root.

## Red Flags / When to Stop

- **Rebase introduces conflicts that need user context.** `git rebase --abort` and exit non-zero. Mechanical conflicts are resolved inline; only ambiguous/contradicting ones stop here.
- **Push is rejected AND neither retry nor reset completes cleanly.** Escalate; never exit while local main is ahead of origin/main.
- **Main has moved during the ritual.** Re-rebase and re-merge via the retry path. Do NOT bridge with a merge commit — this repo's convention is rebase + ff-only.
- **`-d` refuses to delete the branch.** The branch isn't merged despite the preceding ff-only merge. Exit non-zero; do NOT escalate to `-D`.

## Explicitly out of scope

- **Linear state transitions, stale-parent labeling, untracked-file preservation, worktree removal, codex broker reap** — all handled by `close-issue`. This skill is pure git.
- **Tests, code review, docs, decision captures** — belong in `/prepare-for-review`, which runs earlier.
- **Tags, release notes** — N/A for this dotfiles repo.
- **Multi-branch cascades** (dev → staging → main) — N/A; this repo is main-only.
- **PR-based integration** — this skill is direct-to-main. A project that opens PRs instead would ship its own `close-branch` and leave `$INTEGRATION_SHA` empty (a PR-pending signal `close-issue` handles natively).
- **Undoing a close** — if the wrong branch was closed, use git reflog to recover rather than asking this skill to "unclose".
