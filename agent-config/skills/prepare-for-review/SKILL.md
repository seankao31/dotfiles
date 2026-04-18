---
name: prepare-for-review
description: Use when implementation is complete and tests pass, before handing off for human review. Runs code review (codex-review-gate), then doc/decision updates, posts a Linear comment with a review summary and QA plan, and moves the issue to In Review. Useful at the tail of autonomous ralph-loop sessions AND interactive "I just finished this feature" handoffs.
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

Check the current Linear issue state. Use whichever method is available:

- **CLI available** (`linear --version` succeeds): `linear issue view <ISSUE-ID> --json | jq -r '.state.name'`
- **CLI not available**: invoke the `linear-workflow` skill and ask it to fetch the current state of the issue.

Expected states:

- **In Review** — the handoff already completed. Do not re-post the comment or re-transition. Exit cleanly.
- **In Progress** — proceed with the sequence below.
- **Any other state** — stop and surface to the reviewer. Something is off with the dispatch lifecycle.

## The Sequence (run in order)

### Step 1: Codex review gate

Invoke the `codex-review-gate` skill in **per-task mode** — pass the branch start SHA as base, so the review covers only the commits in this implementation session. Iterate on findings: fix, commit, re-run until the review is clean. This is the implementer fix loop; the human reviewer does the final human-in-the-loop assessment when they pick up the In Review branch.

**Determining the base SHA** — check in this order:

1. Read `.ralph-base-sha` from the worktree root if it exists. The ralph orchestrator writes this file at dispatch time to record the exact SHA where the implementation session started (which may be a parent feature branch, not main, for DAG-chained tickets).

2. If the file doesn't exist (interactive session), fall back to:

   ```bash
   git merge-base HEAD main
   ```

   This is reliable for branches cut directly from main. **For stacked branches** (branching from another feature branch, not main) use `git merge-base HEAD <parent-branch-name>` instead, or record the SHA explicitly when you create the branch (`git rev-parse HEAD` before the first feature commit). Stacked interactive branches must provide the base SHA manually — there is no reliable automatic heuristic without `.ralph-base-sha`.

### Step 2: Update stale docs

Invoke the `update-stale-docs` skill. Run this AFTER the codex fix loop — review-driven code fixes may have changed behavior that the docs need to reflect. Ensures READMEs, inline comments, and doc files are current.

### Step 3: Capture decisions

Invoke the `capture-decisions` skill. Records any non-obvious implementation choices made during the session AND during the code review fix loop — the *why*, not the *what*.

### Step 4: Prune completed docs

Invoke the `prune-completed-docs` skill. Removes or archives now-stale planning docs, decision scratch, superseded specs, etc.

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

**If the `linear` CLI is not installed** (`linear --version` fails): post the comment via the `linear-workflow` skill instead, describing what you need posted. The `linear-workflow` skill handles CLI-unavailable fallback to MCP tools.

### Step 6: Move issue to In Review via linear-workflow

Invoke the `linear-workflow` skill and request the `In Progress → In Review` transition.

DO NOT call the `linear` CLI directly to change state. The `linear-workflow` skill handles idempotency (the ralph orchestrator may have already moved the issue to In Progress externally) and any pre-transition validation. ENG-183 audited this skill for autonomous-session compatibility; it handles the "state already changed externally" case.

## Red Flags / When to Stop

- **Tests are failing.** Do NOT run this skill. Fix tests first. This skill is for handoff, not for papering over incomplete work.
- **`codex-review-gate` returns blocking findings.** Fix them, re-run the gate. Do not move to In Review with known blocking issues unsurfaced.
- **The QA test plan is empty or generic.** Stop and actually think about what a reviewer would need to verify. A handoff comment that says "verify it works" is a failure of this skill — the agent that wrote the code knows the risky paths, and capturing them at handoff is the cheap moment.
- **Deviations from the PRD are substantial enough they need discussion.** Post the comment anyway (the reviewer will see it), but flag loudly in the Review Summary section.
- **Linear state is unexpected** (not In Progress and not In Review). Something is off with the dispatch lifecycle — stop and surface to the reviewer rather than proceeding. See the Idempotency check section above for the expected states.
