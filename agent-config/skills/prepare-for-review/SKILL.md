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

Check the current Linear issue state via the Linear CLI:

```bash
linear issue view <ISSUE-ID> --json 2>/dev/null | jq -r '.state.name'
```

If the CLI fails (exits non-zero or returns empty output), the Linear API is unreachable from this environment. In that case, surface this to the reviewer and stop — do not attempt to complete the handoff without being able to verify state or post the review comment.

Expected states:

- **In Review** — the handoff already completed. Do not re-post the comment or re-transition. Exit cleanly.
- **In Progress** — proceed with the sequence below.
- **Any other state** — stop and surface to the reviewer. Something is off with the dispatch lifecycle.

## Pre-flight: verify clean working tree

Before running any steps, verify that all implementation work is committed:

```bash
git status --short
```

Acceptable state:
- **No output / empty** — clean tree, proceed.
- **`??` lines in known doc paths** (`agent-config/docs/`, `docs/`, `memory/`, `.claude/`) — acceptable; the doc steps will create files there.

Stop conditions (fix before proceeding):
- **Any `M`, `D`, `A`, or `R` lines** — uncommitted changes to tracked files. Commit them first.
- **`??` lines outside doc/memory paths** — new implementation source files that were never committed. Commit them before running this skill. A branch with untracked source files must not be moved to In Review.

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
git add -u                  # stage modifications to already-tracked files
# Also add new files in the doc/decision/memory directories created by the doc skills
git add -- agent-config/docs/ docs/ memory/ .claude/projects/ 2>/dev/null || true
git diff --cached --quiet || git commit -m "docs: update stale docs and capture decisions"
```

The `--quiet` guard skips the commit if Steps 1–3 made no changes. Using `git add -u` plus explicit doc paths avoids staging pre-existing untracked scratch files at the repo root. **Known limitation:** if pre-existing untracked scratch files exist inside the doc directories, they will be staged. The pre-flight check above should catch this — if `git status` showed `??` lines in doc paths before running the skill, verify those files were put there intentionally.

### Step 4: Codex review gate

Invoke the `codex-review-gate` skill in **per-task mode** (not final-branch mode) — pass the branch start SHA as base, so the review covers only the commits in this implementation session (code + the doc commit from Step 3.5). Per-task mode supports an implementer fix loop: iterate on findings, fix, commit, re-run the gate until it is clean. This is correct — the `codex-review-gate` skill's own documentation says per-task mode uses the "implementer fix loop." The final-branch mode ("STOP and ask the user") is not used here.

**Determining the base SHA** — check in this order:

1. Read `.ralph-base-sha` from the worktree root if it exists. The ralph orchestrator writes this file at dispatch time to record the exact SHA where the implementation session started (which may be a parent feature branch, not main, for DAG-chained tickets).

2. If the file doesn't exist (interactive session), detect the trunk branch:

   ```bash
   # Prefer the remote ref (avoids failure when local trunk branch doesn't exist)
   TRUNK_REF=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null)
   if [ -n "$TRUNK_REF" ]; then
     git merge-base HEAD "$TRUNK_REF"
   else
     # Fall back to well-known local branch names
     TRUNK=""
     git show-ref --verify --quiet refs/heads/main && TRUNK=main
     [ -z "$TRUNK" ] && git show-ref --verify --quiet refs/heads/master && TRUNK=master
     if [ -z "$TRUNK" ]; then
       echo "Cannot determine trunk. Set .ralph-base-sha or pass base SHA explicitly." >&2
       exit 1
     fi
     git merge-base HEAD "$TRUNK"
   fi
   ```

   **⚠ Stop if this might be a stacked branch.** If this branch was based on another feature branch (not the trunk), `git merge-base HEAD <trunk>` will include the parent's commits in the review scope, producing spurious review findings and an inaccurate handoff summary. Before proceeding with the trunk merge-base, ask: "Is this branch cut from the trunk, or from another feature branch?" If stacked, provide the base SHA explicitly — the SHA of the first commit you made on this branch — and do not use the trunk merge-base.

### Step 5: Post Linear handoff comment

First check whether a handoff comment for this specific revision was already posted (handles retries after partial failures, without suppressing re-runs after feedback commits):

```bash
CURRENT_SHA=$(git rev-parse HEAD)
ALREADY_POSTED=$(linear issue comment list <ISSUE-ID> --json 2>/dev/null \
  | jq --arg sha "$CURRENT_SHA" \
      '[.nodes[] | select(.body | contains("## Review Summary") and contains($sha))] | length > 0')
```

Note: `linear issue comment list --json` returns `{"nodes": [...], "pageInfo": {...}}` — use `.nodes[]`, not `.[]`.

If `ALREADY_POSTED` is `true`, skip to Step 6.

**Note:** If the `linear` CLI is unavailable, this check cannot run — proceed with posting and accept a potential duplicate on retry after a partial failure.

Include `<!-- review-sha: $CURRENT_SHA -->` as the first line of the `## Review Summary` section in the comment body so the SHA-based dedup check can find it on retry.

Otherwise, post a comment using this template. Fill every section; empty sections signal the skill was run mechanically.

Write the body to a tempfile first (Linear CLI prefers `--body-file` for multi-paragraph markdown), then post. Use `mktemp` for the path so concurrent ralph sessions don't clobber each other:

```bash
COMMENT_FILE=$(mktemp /tmp/ralph-handoff-XXXXXX)
cat > "$COMMENT_FILE" <<COMMENT
## Review Summary
<!-- review-sha: $CURRENT_SHA -->

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

**If the `linear` CLI fails:** The `linear-workflow` skill also uses the same CLI binary, so it is not a fallback. If Linear is unreachable, this skill cannot complete the handoff — surface the error and stop.

### Step 6: Move issue to In Review via linear-workflow

Invoke the `linear-workflow` skill and request the `In Progress → In Review` transition.

DO NOT call the `linear` CLI directly to change state. The `linear-workflow` skill handles idempotency and any pre-transition validation. ENG-183 audited this skill for autonomous-session compatibility; it handles the "state already changed externally" case.

## Red Flags / When to Stop

- **Tests are failing.** Do NOT run this skill. Fix tests first.
- **`codex-review-gate` returns blocking findings.** Fix them, re-run the gate. Do not move to In Review with known blocking issues unsurfaced.
- **The QA test plan is empty or generic.** Stop and actually think about what a reviewer needs to verify — the agent that wrote the code knows the risky paths, and capturing them at handoff is the cheap moment.
- **Deviations from the PRD are substantial enough they need discussion.** Post the comment anyway (the reviewer will see it), but flag loudly in the Review Summary section.
- **Linear state is unexpected** (not In Progress and not In Review). Something is off with the dispatch lifecycle — stop and surface to the reviewer.
