---
name: finishing-a-development-branch
description: Use when implementation is complete, all tests pass, and you need to decide how to integrate the work - guides completion of development work by presenting structured options for merge, PR, or cleanup
model: sonnet
allowed-tools: Bash, Read, Glob, Grep, Agent
---

# Finishing a Development Branch

## Overview

Guide completion of development work by presenting clear options and handling chosen workflow.

**Core principle:** Verify tests → Present options → Execute choice → Clean up.

## The Process

### Step 1: Verify Tests

**Before presenting options, verify tests pass:**

```bash
# Run project's test suite
npm test / cargo test / pytest / go test ./...
```

**If tests fail:**
```
Tests failing (<N> failures). Must fix before completing:

[Show failures]

Cannot proceed with merge/PR until tests pass.
```

Stop. Don't proceed to Step 2.

**If tests pass:** Continue to Step 1b.

### Step 1b: Documentation Sweep

**After tests pass, before presenting merge options:**

Invoke `update-stale-docs` to ensure all documentation surfaces reflect the changes, then invoke `capture-decisions` to record any non-obvious implementation choices made during the branch, then invoke `prune-completed-docs` to clean up any doc bloat.

Do not proceed to Step 2 until all three complete.

### Step 2: Determine Base Branch

```bash
# Try common base branches
git merge-base HEAD main 2>/dev/null || git merge-base HEAD master 2>/dev/null
```

Or ask: "This branch split from main - is that correct?"

### Step 3: Present Options

Present exactly these options:

```
Implementation complete. What would you like to do?

1. Merge back to <base-branch> locally
   a. Rebase and merge (default) — linear history, commits land individually
   b. Merge commit — preserves branch history, explicit merge commit
   c. Squash merge — single commit on target branch, branch history discarded
2. Push and create a Pull Request
3. Keep the branch as-is (I'll handle it later)
4. Discard this work

Which option?
```

**Don't add explanation** beyond what's shown. If the user says "1" without a sub-option, use **1a (rebase and merge)**.

### Step 4: Execute Choice

#### Option 1: Merge Locally

**Execute the merge strategy chosen in Step 3 (default: rebase and merge):**

```bash
# Switch to base branch
git checkout <base-branch>

# Pull latest
git pull

# Strategy (a): Rebase and merge
git rebase <feature-branch>  # replays feature commits onto base
# (result is already fast-forwarded)

# Strategy (b): Merge commit
git merge --no-ff <feature-branch>

# Strategy (c): Squash merge
git merge --squash <feature-branch>
git commit

# Verify tests on merged result
<test command>

# If tests pass
git branch -d <feature-branch>
```

Then: Mark Linear issue as Done (invoke `linear-workflow`), then cleanup worktree (Step 5)

#### Option 2: Push and Create PR

```bash
# Push branch
git push -u origin <feature-branch>

# Create PR
gh pr create --title "<title>" --body "$(cat <<'EOF'
## Summary
<2-3 bullets of what changed>

## Test Plan
- [ ] <verification steps>
EOF
)"
```

Then: Mark Linear issue as Done (invoke `linear-workflow`), then cleanup worktree (Step 5)

#### Option 3: Keep As-Is

Report: "Keeping branch <name>. Worktree preserved at <path>."

**Don't cleanup worktree.**

#### Option 4: Discard

**Confirm first:**
```
This will permanently delete:
- Branch <name>
- All commits: <commit-list>
- Worktree at <path>

Type 'discard' to confirm.
```

Wait for exact confirmation.

If confirmed:
```bash
git checkout <base-branch>
git branch -D <feature-branch>
```

Then: Cleanup worktree (Step 5)

### Step 5: Cleanup Worktree

**For Options 1, 2, 4:**

Check if in worktree:
```bash
git worktree list | grep $(git branch --show-current)
```

If yes:
```bash
git worktree remove <worktree-path>
```

**For Option 3:** Keep worktree.

## Quick Reference

| Option | Merge | Push | Keep Worktree | Cleanup Branch |
|--------|-------|------|---------------|----------------|
| 1. Merge locally | ✓ | - | - | ✓ |
| 2. Create PR | - | ✓ | ✓ | - |
| 3. Keep as-is | - | - | ✓ | - |
| 4. Discard | - | - | - | ✓ (force) |

## Common Mistakes

**Skipping test verification**
- **Problem:** Merge broken code, create failing PR
- **Fix:** Always verify tests before offering options

**Open-ended questions**
- **Problem:** "What should I do next?" → ambiguous
- **Fix:** Present exactly 4 structured options

**Automatic worktree cleanup**
- **Problem:** Remove worktree when might need it (Option 2, 3)
- **Fix:** Only cleanup for Options 1 and 4

**No confirmation for discard**
- **Problem:** Accidentally delete work
- **Fix:** Require typed "discard" confirmation

## Red Flags

**Never:**
- Proceed with failing tests
- Merge without verifying tests on result
- Delete work without confirmation
- Force-push without explicit request

**Always:**
- Verify tests before offering options
- Run documentation sweep before offering options (Step 1b)
- Present exactly 4 options
- Get typed confirmation for Option 4
- Clean up worktree for Options 1 & 4 only

## Integration

**Called by:**
- **subagent-driven-development** (Step 7) - After all tasks complete

**Invokes:**
- **update-stale-docs** - Documentation sweep before completion (Step 1b)
- **capture-decisions** - Record non-obvious implementation choices (Step 1b)
- **prune-completed-docs** - Doc bloat cleanup (Step 1b)
- **linear-workflow** - Mark Linear issue as Done (after Option 1 or 2)

**Pairs with:**
- **using-git-worktrees** - Cleans up worktree created by that skill
