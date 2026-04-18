---
name: prepare-for-review
description: Use when implementation is complete and tests pass, before handing off for human review. Runs doc/decision updates, code review, posts a Linear comment with a review summary and QA plan, and moves the issue to In Review. Useful at the tail of autonomous ralph-loop sessions AND interactive "I just finished this feature" handoffs.
model: sonnet
allowed-tools: Skill, Bash, Read, Glob, Grep, Write, Edit
---

# Prepare for Review

Hand-off checklist for "implementation is done, tests pass, now it needs human review."

## When to Use

- **At the end of an autonomous ralph-loop session** — the orchestrator prompt template names `/prepare-for-review` as the session's closing step.
- **At the end of an interactive implementation session** — when Sean finishes a feature and wants the handoff polish done consistently.

Do NOT use this skill to cover up an incomplete implementation. If tests fail or the work isn't done, fix that first.

## The Sequence (run in order)

### Step 1: Update stale docs

Invoke the `update-stale-docs` skill. Ensures READMEs, inline comments, and doc files reflect the new code behavior. Code + docs + comments are a single unit of work per the project's CLAUDE.md.

### Step 2: Capture decisions

Invoke the `capture-decisions` skill. Records any non-obvious implementation choices made during the session — the *why*, not the *what*.

### Step 3: Prune completed docs

Invoke the `prune-completed-docs` skill. Removes or archives now-stale planning docs, decision scratch, superseded specs, etc.

### Step 4: Codex review gate

Invoke the `codex-review-gate` skill in **per-task mode** — pass the branch start SHA as base, so the review covers only the commits in this implementation session. Iterate on findings: fix, commit, re-run until the review is clean. This is the implementer fix loop; the human reviewer will do the final human-in-the-loop assessment when they pick up the In Review branch.

The branch start SHA to pass as `--base` is the SHA of the last commit on main before this feature branch was created. Find it with:

```bash
git merge-base HEAD main
```

### Step 5: Post Linear handoff comment

Post a comment on the Linear issue using this template. Fill every section; empty sections signal the skill was run mechanically.

Write the body to a tempfile first (Linear CLI prefers `--body-file` for multi-paragraph markdown), then post:

```bash
cat > /tmp/handoff-comment.md <<'COMMENT'
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

linear issue comment add <ISSUE-ID> --body-file /tmp/handoff-comment.md
```

Verify the exact CLI syntax against `linear issue comment add --help` at invocation time if uncertain — do not guess flags.

### Step 6: Move issue to In Review via linear-workflow

Invoke the `linear-workflow` skill and request the `In Progress → In Review` transition.

DO NOT call the `linear` CLI directly to change state. The `linear-workflow` skill handles idempotency (the ralph orchestrator may have already moved the issue to In Progress externally) and any pre-transition validation. ENG-183 audited this skill for autonomous-session compatibility; it handles the "state already changed externally" case.

## Red Flags / When to Stop

- **Tests are failing.** Do NOT run this skill. Fix tests first. This skill is for handoff, not for papering over incomplete work.
- **`codex-review-gate` returns blocking findings.** Fix them, re-run the gate. Do not move to In Review with known blocking issues unsurfaced.
- **The QA test plan is empty or generic.** Stop and actually think about what a reviewer would need to verify. A handoff comment that says "verify it works" is a failure of this skill — the agent that wrote the code knows the risky paths, and capturing them at handoff is the cheap moment.
- **Deviations from the PRD are substantial enough they need discussion.** Post the comment anyway (the reviewer will see it), but flag loudly in the Review Summary section.
- **Linear state is not In Progress.** Something is off. Check whether the ralph orchestrator set state externally, or whether the issue was never dispatched. Do not skip silently to In Review.
