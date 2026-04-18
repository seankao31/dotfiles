---
name: prepare-for-review
description: Use when implementation is complete and tests pass, before handing off for human review. Runs doc/decision updates, codex review (all in one pass), posts a Linear comment with a review summary and QA plan, and moves the issue to In Review. Useful at the tail of autonomous ralph-loop sessions AND interactive "I just finished this feature" handoffs.
model: sonnet
allowed-tools: Skill, Bash, Read, Glob, Grep, Write, Edit
---

# Prepare for Review

Hand-off checklist for "implementation is done, tests pass, now it needs human review."

## When to Use

- **At the end of an autonomous ralph-loop session** — the orchestrator prompt template names `/prepare-for-review` as the session's closing step.
- **At the end of an interactive implementation session** — when Sean finishes a feature and wants the handoff polish done consistently.

Do NOT use this skill to cover up an incomplete implementation. If tests fail or the work isn't done, fix that first.

## Idempotency check (run first, before any steps)

Check the current Linear issue state. Attempt the CLI first; if it fails for any reason (binary not found, authentication failure, network error), fall back to `linear-workflow`:

```bash
linear issue view <ISSUE-ID> --json 2>/dev/null | jq -r '.state.name'
# If the above exits non-zero or returns empty: invoke linear-workflow
# skill instead and ask it to fetch the current issue state.
```

Expected states:

- **In Review** — the handoff already completed. Do not re-post the comment or re-transition. Exit cleanly.
- **In Progress** — proceed with the sequence below.
- **Any other state** — stop and surface to the reviewer. Something is off with the dispatch lifecycle.

## The Sequence (run in order)

### Step 1: Update stale docs

Invoke the `update-stale-docs` skill. Ensures READMEs, inline comments, and doc files reflect the final code behavior.

### Step 2: Capture decisions

Invoke the `capture-decisions` skill. Records any non-obvious implementation choices made during the session — the *why*, not the *what*.

**In autonomous sessions (ralph loop):** `capture-decisions` presents a proposal and says "wait for approval before writing." With no human present, treat this as a self-approval — propose, then execute immediately. Sean will review the decisions at review time.

### Step 3: Prune completed docs

Invoke the `prune-completed-docs` skill. Removes or archives now-stale planning docs, decision scratch, superseded specs, etc.

**In autonomous sessions (ralph loop):** Same as Step 2 — `prune-completed-docs` also has an approval gate. Self-approve in autonomous mode; proceed immediately after presenting the proposal.

### Step 3.5: Commit doc/decisions changes

Steps 1–3 may have modified or created files. Commit them so the codex review in Step 4 sees the complete branch (including docs):

```bash
git status --short          # review what was added/modified by the preceding steps
git add -A                  # stage all changes including new ADR/memory files from capture-decisions
git diff --cached --quiet || git commit -m "docs: update stale docs and capture decisions"
```

The `--quiet` guard skips the commit if Steps 1–3 made no changes. The `git status` check before `git add -A` is required so you know exactly what is being staged.

### Step 4: Codex review gate

Invoke the `codex-review-gate` skill in **per-task mode** — pass the branch start SHA as base, so the review covers only the commits in this implementation session (code + the doc commit from Step 3.5). Iterate on findings: fix, commit, re-run until the review is clean.

**Determining the base SHA** — check in this order:

1. Read `.ralph-base-sha` from the worktree root if it exists. The ralph orchestrator writes this file at dispatch time to record the exact SHA where the implementation session started (which may be a parent feature branch, not main, for DAG-chained tickets).

2. If the file doesn't exist (interactive session), detect the trunk branch:

   ```bash
   TRUNK=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's|refs/remotes/origin/||')
   if [ -z "$TRUNK" ]; then
     git show-ref --verify --quiet refs/heads/main && TRUNK=main
   fi
   if [ -z "$TRUNK" ]; then
     git show-ref --verify --quiet refs/heads/master && TRUNK=master
   fi
   if [ -z "$TRUNK" ]; then
     echo "Cannot determine trunk branch. Set .ralph-base-sha or pass base SHA explicitly." >&2
     exit 1
   fi
   git merge-base HEAD "$TRUNK"
   ```

   **⚠ Stacked interactive branches:** If this branch was based on another feature branch (not the trunk), `git merge-base HEAD <trunk>` will include the parent's commits in the review scope, producing spurious findings and an inaccurate handoff summary. For stacked branches, provide the base SHA explicitly — the SHA of the first commit you made on this branch.

### Step 5: Post Linear handoff comment

Post a comment on the Linear issue using this template. Fill every section; empty sections signal the skill was run mechanically.

Write the body to a tempfile first (Linear CLI prefers `--body-file` for multi-paragraph markdown), then post. Use `mktemp` for the path so concurrent ralph sessions don't clobber each other:

```bash
COMMENT_FILE=$(mktemp /tmp/ralph-handoff-XXXXXX)
cat > "$COMMENT_FILE" <<'COMMENT'
## Review Summary

**What shipped:** <1-3 sentence summary of the implementation>

**Deviations from the PRD:** <bulleted list of anything that differs from the issue description; "None" if identical>

**Surprises during implementation:** <bulleted list of things the PRD didn't anticipate; "None" if clean>

## QA Test Plan

**Golden path:** <specific manual steps to verify the core behavior works>

**Edge cases worth checking:** <bulleted list of risky paths — what was tricky to get right, what boundary conditions exist>

**Known gaps / deferred:** <anything intentionally left unfinished; "None" if complete>

## Commits in this branch

<output of `git log --oneline <base>..HEAD`>
COMMENT

linear issue comment add <ISSUE-ID> --body-file "$COMMENT_FILE"
rm -f "$COMMENT_FILE"
```

Verify the exact CLI syntax against `linear issue comment add --help` at invocation time if uncertain — do not guess flags.

**If the `linear` CLI is not installed** (or fails for any reason): post the comment via the `linear-workflow` skill instead, describing what you need posted.

### Step 6: Move issue to In Review via linear-workflow

Invoke the `linear-workflow` skill and request the `In Progress → In Review` transition.

DO NOT call the `linear` CLI directly to change state. The `linear-workflow` skill handles idempotency and any pre-transition validation. ENG-183 audited this skill for autonomous-session compatibility; it handles the "state already changed externally" case.

## Red Flags / When to Stop

- **Tests are failing.** Do NOT run this skill. Fix tests first.
- **`codex-review-gate` returns blocking findings.** Fix them, re-run the gate. Do not move to In Review with known blocking issues unsurfaced.
- **The QA test plan is empty or generic.** Stop and actually think about what a reviewer needs to verify — the agent that wrote the code knows the risky paths, and capturing them at handoff is the cheap moment.
- **Deviations from the PRD are substantial enough they need discussion.** Post the comment anyway (the reviewer will see it), but flag loudly in the Review Summary section.
- **Linear state is unexpected** (not In Progress and not In Review). Something is off with the dispatch lifecycle — stop and surface to the reviewer.
