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

# 2. Resolve the feature branch from the issue ID via local branch listing.
#    Linear's branch-name convention is lowercase `<issue-id>-<slug>`.
ISSUE_SLUG=$(echo "$ISSUE_ID" | tr '[:upper:]' '[:lower:]')
FEATURE_BRANCH=$(git branch --list "${ISSUE_SLUG}-*" --format='%(refname:short)')
match_count=$(printf '%s\n' "$FEATURE_BRANCH" | grep -c . || true)

if [ "$match_count" -gt 1 ]; then
  echo "Error: multiple branches match '${ISSUE_SLUG}-*':" >&2
  printf '%s\n' "$FEATURE_BRANCH" >&2
  exit 1
fi

if [ "$match_count" -eq 0 ]; then
  # Fallback: ask Linear for the canonical branchName in case the local branch
  # uses a non-standard prefix (rename, historic naming, etc.).
  FEATURE_BRANCH=$(linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.branchName // empty')
  if [ -z "$FEATURE_BRANCH" ] || ! git show-ref --verify --quiet "refs/heads/$FEATURE_BRANCH"; then
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

### 1. Verify the issue is In Review

```bash
linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.state.name'
```

Expected: `In Review`.

- **In Review** — proceed.
- **In Progress** — the work hasn't been handed off for review yet. Run `/prepare-for-review` first (added in ENG-182; must be merged before this skill is usable on a branch still in In Progress).
- **Done** — nothing to do; the branch was already closed. Investigate whether this worktree is leftover and can be removed.
- **Any other state** — stop and surface to the user. The dispatch lifecycle is off.

### 2. Verify all `blocked-by` parents are Done

```bash
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/linear.sh"

linear_get_issue_blockers "$ISSUE_ID" | jq -r '
  .[] | select(.state != "Done") | "\(.id)\t\(.state)"
'
```

- **No output** — no unresolved blockers; proceed.
- **Any output** — each line is `<blocker-id>\t<state>`. STOP. Print the list and refuse to close. Tell the user: `Canceled` blockers are NOT treated as resolved (per ralph v2 Decision 6 in `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md`); the supported way to declare "this is no longer a blocker" is to remove the relation in Linear via `linear issue relation delete "$ISSUE_ID" blocked-by <blocker-id>` and re-run. No `--force` escape hatch.

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

### Step 7: Remove the worktree

Last step. CWD is the main checkout, so worktree removal no longer threatens the session. Keeping it last means that if removal fails (dirty worktree, process holding files), the high-value state transitions — ff-merge, push, branch delete, Linear Done — have already been applied cleanly.

```bash
git worktree remove "$WORKTREE_PATH"
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
