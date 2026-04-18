---
name: close-feature-branch
description: Project-local skill for chezmoi/agent-config. Use when Sean has finished reviewing a feature branch and is ready to ship — runs rebase, fast-forward merge to main, push, branch deletion, worktree removal, and the Linear Done transition. NOT for multi-branch cascades (dev/staging/main) — this repo is main-only. NOT a replacement for prepare-for-review; that skill runs earlier to produce the review artifacts.
model: sonnet
allowed-tools: Skill, Bash, Read, Glob, Grep
---

# Close Feature Branch (chezmoi)

The merge-and-cleanup ritual for this repo, run AFTER Sean has reviewed the work. This skill is explicitly NOT for doing tests, code review, docs, or decision captures — those belong in `/prepare-for-review`, which runs earlier in the lifecycle.

## When to Use

- After Sean has reviewed an In Review Linear issue and approved the work for merge.
- On a feature branch in a worktree under `.worktrees/` (created by `using-git-worktrees` or the ralph orchestrator).

## Capture branch identity up front

Record the feature branch name AND Linear issue ID before doing anything else. Once Step 2 checks out main and Step 4 removes the worktree, these values can no longer be derived automatically:

```bash
FEATURE_BRANCH=$(git rev-parse --abbrev-ref HEAD)
ISSUE_ID=$(echo "$FEATURE_BRANCH" | grep -oiE '[A-Z]+-[0-9]+' | head -1)
WORKTREE_PATH=$(git rev-parse --show-toplevel)
```

All subsequent shell commands reference `$FEATURE_BRANCH`, `$ISSUE_ID`, and `$WORKTREE_PATH`.

## Pre-flight

### 1. Verify the issue is In Review

```bash
linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.state.name'
```

Expected: `In Review`.

- **In Review** — proceed.
- **In Progress** — the work hasn't been handed off for review yet. Run `/prepare-for-review` first (added in ENG-182; must be merged before this skill is usable on a branch still in In Progress).
- **Done** — nothing to do; the branch was already closed. Investigate whether this worktree is leftover and can be removed.
- **Any other state** — stop and surface to Sean. The dispatch lifecycle is off.

### 2. Verify no uncommitted tracked-file changes

```bash
git status --short
```

- **Any line NOT starting with `??`** — uncommitted changes to tracked files (includes ` M`, `MM`, `UU`, `T`, `A`, `D`, `R`, etc.). STOP. Commit or discard them before proceeding. `git worktree remove` will refuse to clean up a dirty worktree, and `--force` has destroyed work before — never reach for it.
- **Lines starting with `??`** — untracked files. Proceed to §3, which handles them explicitly.
- **No output** — clean; proceed.

### 3. Preserve untracked files

```bash
git ls-files --others --exclude-standard
```

If this lists any files, stop and ask Sean what to do with each one. Options:
- Commit them (if they're part of the work that should land).
- Copy them out to a safe location (e.g., `~/ralph-handoff-artifacts/$ISSUE_ID/`) before removing the worktree.
- Explicitly discard if they're truly ephemeral.

Never silently discard untracked files. `plan.md` files have been lost this way before — the whole reason this pre-flight exists.

## The Ritual (run in order)

Working directory is the feature worktree throughout, except where noted.

### Step 1: Rebase onto latest main

```bash
git fetch origin main
git rebase origin/main
```

**If rebase fails with conflicts:** run `git rebase --abort` and escalate to Sean. Do NOT auto-resolve silently. Reason: Sean prefers to resolve conflicts himself rather than discover a bad rebase weeks later.

### Step 2: Fast-forward merge to main

Switch to the main checkout (NOT the worktree) — the main repo at the chezmoi root:

```bash
cd /Users/seankao/.local/share/chezmoi
```

Verify it's clean (Sean also uses this checkout for ad-hoc edits):

```bash
git status --short
```

If this produces any output, STOP and surface to Sean. Do not merge into a dirty main checkout — a failed `git pull --ff-only` or `git merge --ff-only` can leave both the main checkout and the close ritual half-completed.

Once clean:

```bash
git checkout main
git pull --ff-only origin main
git merge --ff-only "$FEATURE_BRANCH"
```

If the merge is not fast-forward (origin/main advanced between the rebase and the merge), return to the worktree and re-run Step 1.

Never create a merge commit here. This repo uses rebase + ff-only as a durable convention — see user memory `feedback_rebase_merge.md`.

### Step 3: Push

Still in the main checkout:

```bash
git push origin main
```

**If the push is rejected** (someone pushed in between): local main has already absorbed the feature commits via ff-merge, so it has diverged from the new origin/main. `git pull --ff-only` won't resolve this. Recovery:

1. `git reset --hard origin/main` on the main checkout (discards the local ff-merge).
2. `cd "$WORKTREE_PATH"` back to the feature worktree.
3. Re-run Step 1 (rebase onto the new origin/main).
4. Re-run Step 2 and Step 3.

Alternatively, escalate to Sean if you're unsure — losing an ff-merge state is recoverable, but making it worse is harder to undo.

### Step 4: Remove the worktree

The worktree has the feature branch checked out, so it must be removed *before* the branch can be deleted (`git branch -d` refuses to delete a branch that is checked out anywhere).

Ensure the current shell is NOT inside the worktree (Step 2 `cd`'d to main, so you should already be in the main checkout). Then:

```bash
git worktree remove "$WORKTREE_PATH"
```

**If removal fails:** Do NOT use `--force`. Check for:
- Uncommitted changes (re-run pre-flight)
- Untracked files that the pre-flight missed
- An editor or other process holding files open in the worktree
- A shell `cd`'d into the worktree

`--force` has destroyed work before; the failure is informational, not an obstacle to blast through.

### Step 5: Delete the feature branch

Now that the worktree is gone, delete the branch locally and on the remote:

```bash
git branch -d "$FEATURE_BRANCH"
git push origin --delete "$FEATURE_BRANCH"
```

Use `-d` (safe delete), not `-D` (force delete). If `-d` refuses because the branch isn't merged, something went wrong with the rebase/merge — investigate before escalating to `-D`.

### Step 6: Move Linear issue to Done

Invoke the `linear-workflow` skill with the explicit issue ID (`$ISSUE_ID`), requesting the `In Review → Done` transition. Passing the ID explicitly is required — by this point, the feature branch and worktree are gone, so `linear-workflow` cannot infer the target issue from the current branch context. Do NOT call the `linear` CLI directly.

## Red Flags / When to Stop

- **Issue state is not In Review.** See Pre-flight §1 for the disposition map.
- **Rebase introduces conflicts.** Abort and escalate. Do not auto-resolve.
- **`git worktree remove` fails.** Do NOT use `--force`. Diagnose the underlying cause.
- **Main has moved during the ritual.** Re-rebase and re-merge. Do NOT bridge with a merge commit — this repo's convention is rebase + ff-only.
- **`-d` refuses to delete the branch.** The branch isn't merged despite the preceding ff-only merge. Investigate rather than escalating to `-D`.

## Explicitly out of scope

Per the design doc (Decision 4 + Follow-up #6) and ENG-186 ticket:

- **Tests, code review, docs, decision captures** — belong in `/prepare-for-review`, which runs earlier.
- **Tags, release notes** — N/A for this dotfiles repo.
- **Multi-branch cascades** (dev → staging → main) — N/A; this repo is main-only.
- **Undoing a close** — if the wrong branch was closed, use git reflog to recover rather than asking this skill to "uncloseˮ.
