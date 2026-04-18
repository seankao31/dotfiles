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

## Determine the Linear issue ID

In ralph-loop sessions, the issue ID is in the prompt template. In interactive sessions, derive it from the branch name:

```bash
ISSUE_ID=$(git rev-parse --abbrev-ref HEAD | grep -oiE '[A-Z]+-[0-9]+' | head -1)
```

If the branch name doesn't contain an issue ID (e.g., no `eng-123` slug), you must supply it manually. All subsequent shell commands use `$ISSUE_ID`.

## Idempotency check (run first, before any steps)

Check the current Linear issue state via the Linear CLI:

```bash
linear issue view "$ISSUE_ID" --json 2>/dev/null | jq -r '.state.name'
```

If the CLI fails (exits non-zero or returns empty output), the Linear API is unreachable from this environment. In that case, surface this to the reviewer and stop — do not attempt to complete the handoff without being able to verify state or post the review comment.

Expected states:

- **In Review** — proceed with the sequence, but skip Step 6 (the issue is already in the right state). The SHA-based dedup in Step 5 handles avoiding duplicate comments for the same HEAD. This allows re-running the skill after new commits are pushed to a branch that's still In Review.
- **In Progress** — proceed with the full sequence including Step 6.
- **Any other state** — stop and surface to the reviewer. Something is off with the dispatch lifecycle.

## Pre-flight: verify clean working tree

Before running any steps, verify that all implementation work is committed and no untracked files exist:

```bash
git status --short
```

The working tree must be **completely clean** (no output), with one exception:

- **`?? .ralph-base-sha`** — acceptable and expected in ralph-loop sessions. The orchestrator writes this file before dispatch. Do not commit or remove it.

All other lines in the output are stop conditions:

- **`M`, `D`, `A`, `R` lines** — uncommitted changes to tracked files. Commit them first.
- **Any other `??` lines** — untracked files. Commit or remove them before running this skill. This includes scratch files in `docs/` or `memory/` — because Step 3.5 stages all new untracked files, any untracked files (other than `.ralph-base-sha`) present at the start of this skill will end up in the docs commit.

Once the working tree is clean (with only the `.ralph-base-sha` exception), any untracked files that appear during Steps 1–3 are guaranteed to have been created by the skill itself and are safe to stage in Step 3.5.

## Compute base SHA (do this before Step 1)

The base SHA is used in Steps 1, 4, and 5. Compute it once now so all steps stay consistent:

1. If `.ralph-base-sha` exists in the worktree root, read it:
   ```bash
   BASE_SHA=$(cat .ralph-base-sha)
   ```

2. Otherwise (interactive session), detect the trunk:
   ```bash
   TRUNK_REF=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null)
   if [ -n "$TRUNK_REF" ]; then
     BASE_SHA=$(git merge-base HEAD "$TRUNK_REF")
   else
     # Try local branches first, then remote tracking refs
     TRUNK_REF=""
     git show-ref --verify --quiet refs/heads/main && TRUNK_REF=refs/heads/main
     [ -z "$TRUNK_REF" ] && git show-ref --verify --quiet refs/heads/master && TRUNK_REF=refs/heads/master
     [ -z "$TRUNK_REF" ] && git show-ref --verify --quiet refs/remotes/origin/main && TRUNK_REF=refs/remotes/origin/main
     [ -z "$TRUNK_REF" ] && git show-ref --verify --quiet refs/remotes/origin/master && TRUNK_REF=refs/remotes/origin/master
     if [ -z "$TRUNK_REF" ]; then
       echo "Cannot determine trunk. Set .ralph-base-sha or pass base SHA explicitly." >&2; exit 1
     fi
     BASE_SHA=$(git merge-base HEAD "$TRUNK_REF")
   fi
   ```

   **⚠ Stop if this might be a stacked branch.** For stacked branches (branching from a feature branch, not the trunk), `git merge-base HEAD <trunk>` includes parent-branch commits and scopes the doc sweep and review incorrectly. Provide `BASE_SHA` explicitly — the commit just before your first commit on this branch: `git rev-parse <your-first-commit>^`.

## The Sequence (run in order)

### Step 1: Update stale docs

Invoke the `update-stale-docs` skill. Ensures READMEs, inline comments, and doc files reflect the final code behavior.

**Important:** `update-stale-docs` uses `git diff --stat` (working tree diff) to identify what changed, but this returns empty output when all work is committed. To give it the right scope — including inline comment text it needs to check — run `git diff "$BASE_SHA" HEAD` and provide the full diff output when invoking the skill. Using `$BASE_SHA` (not `main`) is correct for stacked branches too. (Known limitation: `update-stale-docs` was designed for pre-commit use; a follow-up should make it accept a branch base SHA directly.)

### Step 2: Capture decisions

Invoke the `capture-decisions` skill. Records any non-obvious implementation choices made during the session — the *why*, not the *what*.

**In autonomous sessions (ralph loop):** `capture-decisions` presents a proposal and says "wait for approval before writing." With no human present, treat this as a self-approval — propose, then execute immediately. Sean will review the decisions at review time.

**Note on commits:** `capture-decisions` ends with its own `git commit`. This means this workflow may produce two separate doc commits (one from Step 2, one from Step 3.5 covering prune changes). Both will be in the `$BASE_SHA..HEAD` codex review scope — no action needed.

### Step 3: Prune completed docs

Invoke the `prune-completed-docs` skill. Removes or archives now-stale planning docs, decision scratch, superseded specs, etc.

**In autonomous sessions (ralph loop):** Same as Step 2 — `prune-completed-docs` also has an approval gate. Self-approve in autonomous mode; proceed immediately after presenting the proposal.

### Step 3.5: Commit doc/decisions changes

Steps 1–3 may have modified or created files. Commit them so the codex review in Step 4 sees the complete branch (including docs):

```bash
git status --short          # confirm only expected new files from Steps 1-3
git add -u                  # stage modifications to tracked files
NEW_FILES=$(git ls-files --others --exclude-standard | grep -v '^\.ralph-base-sha$')
[ -n "$NEW_FILES" ] && echo "$NEW_FILES" | xargs git add  # stage new files from doc skills (macOS-safe)
git diff --cached --quiet || git commit -m "docs: update stale docs and capture decisions"
```

The pre-flight required a clean working tree, so all untracked files staged here were created by the skill steps (Steps 1–3). The `--quiet` guard skips the commit if nothing changed.

### Step 4: Codex review gate

Invoke the `codex-review-gate` skill in **per-task mode** (not final-branch mode), passing `--base "$BASE_SHA"` (computed above). The review covers code commits + the doc commit from Step 3.5. Per-task mode supports the implementer fix loop: iterate on findings, fix, commit, re-run the gate until clean.

**Known limitation:** If the codex fix loop results in behavioral code changes, the doc/decision captures from Steps 1–3 may be slightly stale. For minor fixes (style, error handling) this is acceptable. For behavioral changes, re-run `/prepare-for-review` from the top on the updated branch.

### Step 5: Post Linear handoff comment

First check whether a handoff comment for this specific revision was already posted (handles retries after partial failures, without suppressing re-runs after feedback commits):

```bash
CURRENT_SHA=$(git rev-parse HEAD)
ALREADY_POSTED=$(linear issue comment list "$ISSUE_ID" --json 2>/dev/null \
  | jq --arg sha "$CURRENT_SHA" \
      '[.nodes[] | select(.body | contains("## Review Summary") and contains($sha))] | length > 0')
```

Note: `linear issue comment list --json` returns `{"nodes": [...], "pageInfo": {...}}` — use `.nodes[]`, not `.[]`.

**Known limitation:** The dedup check only scans the first page of comments. On issues with more than ~50 comments, a handoff comment from a prior run may be on a later page and go undetected, resulting in a duplicate post. Acceptable for this use case — most issues won't have that many comments.

If `ALREADY_POSTED` is `true`, skip to Step 6.

**If the `linear` CLI is unavailable:** Stop immediately — the handoff cannot complete without the CLI. The comment posting in the next step also requires it, so there's no point continuing.

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

<output of `git log --oneline "$BASE_SHA"..HEAD`>
COMMENT

linear issue comment add "$ISSUE_ID" --body-file "$COMMENT_FILE"
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
