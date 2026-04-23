---
name: close-branch
description: Project-local VCS integration for chezmoi/agent-config. Runs rebase onto local `main`, fast-forward merge, push, HEAD detach, and branch delete for a reviewed feature branch. Invoked ONLY by the global `close-issue` skill — not a user entry point. Chezmoi specifics: base branch is `main`, direct-to-main push (no PR), `-d` (safe delete) for branch removal, rebase onto LOCAL main (not `origin/main`) to absorb unpushed direct-to-main commits.
argument-hint: <issue-id>
model: sonnet
allowed-tools: Bash, Read, Glob, Grep
disable-model-invocation: true
---

# Close Branch (chezmoi)

The VCS integration half of the close ritual. The global `close-issue` skill handles Linear state preflight, untracked-file preservation, stale-parent labeling, the Done transition, and worktree removal; this skill handles every project-specific git decision: base branch, rebase policy, merge strategy, push model, branch-delete semantics.

## When to Use

Only via `Skill(close-branch)` invoked from `close-issue`. Never a direct user entry point.

`disable-model-invocation: true` keeps this skill out of description-based auto-discovery — it's dispatched only by `close-issue`'s explicit `Skill` tool call.

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

Rebase onto **local** `main`, not `origin/main`. The user sometimes commits directly to local main (progress logs, plan tweaks) without pushing immediately; rebasing onto local main absorbs those commits so Step 2's `git merge --ff-only` succeeds. The `git fetch` is still useful — Step 2's `git pull --ff-only origin main` catches any movement on the remote before the merge.

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

CWD is already the main checkout. Verify it's clean (the user also uses this checkout for ad-hoc edits):

```bash
git status --short
```

If this produces any output, exit non-zero. Do not merge into a dirty main checkout — a failed `git pull --ff-only` or `git merge --ff-only` can leave both the main checkout and the close ritual half-completed.

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
   2. `git reset --hard origin/main` on local main (discards the local ff-merge; the feature commits are still reachable via `$FEATURE_BRANCH`).
   3. Re-run Step 1 on the worktree (rebase onto the now-fresh local main, which equals the new origin/main).
   4. Re-run Step 2 (capture a fresh `$PRE_MERGE_SHA`, ff-merge).
   5. Re-run the push.

2. **Reset path** (fallback if retry is not recoverable within this skill): restore local main to its pre-merge state so the operator can investigate without the ff-merge in the way, then exit non-zero with a clear diagnostic:

   ```bash
   git reset --hard "$PRE_MERGE_SHA"
   ```

   The feature branch ref still points at the rebased feature commits; nothing is destroyed.

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

With the branch no longer checked out anywhere, delete it locally and on the remote:

```bash
git branch -d "$FEATURE_BRANCH"
git push origin --delete "$FEATURE_BRANCH"
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
