# Ralph Implement Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task includes cross-model verification via codex-review-gate after code quality review, with a final cross-task codex review before branch completion.

**Goal:** Replace the `prompt_template` string in `config.json` with a new dispatched skill, `ralph-implement`, that encodes the per-session workflow as numbered SKILL.md steps. Orchestrator dispatches via `claude -p "/ralph-implement $ISSUE_ID"`.

**Architecture:** The session-execution recipe moves out of a configurable string in `config.json` and into a skill file at `agent-config/skills/ralph-implement/SKILL.md`. The orchestrator's four substitution variables (`$ISSUE_ID`, `$ISSUE_TITLE`, `$BRANCH_NAME`, `$WORKTREE_PATH`) collapse to a single positional argument — the agent derives the other three from Linear, `git`, and cwd. No change to how the orchestrator computes these values.

**Tech Stack:** bash (bats tests), jq, `linear` CLI, Claude Code `claude -p` dispatch, chezmoi-symlinked skills directory.

**Spec:** `agent-config/docs/specs/2026-04-21-ralph-implement-skill-design.md` (ENG-206).

**Known empirical question (validated during manual dogfood, not this plan):** Whether `claude -p "/ralph-implement ENG-NNN"` reliably triggers the skill via slash-command parsing. The precedent is `/close-feature-branch ENG-197`, which uses the same shape interactively; this plan assumes `claude -p` honors the same parse. If dogfood shows otherwise, a follow-up adjusts the dispatch prompt to a natural-language wrapper like `"Invoke the /ralph-implement skill for ENG-NNN."` — that adjustment is a one-line edit in `orchestrator.sh`.

---

## Task 1: Add the `ralph-implement` skill

**Files:**
- Create: `agent-config/skills/ralph-implement/SKILL.md`

- [x] **Step 1: Create the skill directory and file**

```bash
mkdir -p agent-config/skills/ralph-implement
```

Write `agent-config/skills/ralph-implement/SKILL.md` with this exact content:

````markdown
---
name: ralph-implement
description: Dispatched by the ralph orchestrator to implement a single Linear issue autonomously inside a pre-created worktree. Do NOT auto-invoke.
disable-model-invocation: true
argument-hint: <issue-id>
allowed-tools: Skill, Bash, Read, Glob, Grep, Write, Edit
---

# Ralph Implement

The workflow a single `claude -p` session runs when dispatched by the ralph orchestrator. Invoked with the Linear issue ID as the sole argument:

```
/ralph-implement ENG-NNN
```

The agent receives the issue ID as the invocation argument and exposes it as `$ISSUE_ID`. If the argument is missing, stop and exit without invoking `/prepare-for-review`.

The orchestrator has already `cd`-ed into the worktree, created the branch at the correct DAG base, written `.ralph-base-sha`, and transitioned the issue to `In Progress` before invoking. The steps below run inside that worktree.

## Step 1: Read the PRD

```bash
linear issue view "$ISSUE_ID" --json | jq -r .description
```

The issue description is the spec. Treat it as the source of requirements.

## Step 2: Check for unresolved merge conflicts

```bash
git status --short
```

If the orchestrator pre-merged a parent branch into this worktree, the merge may have left conflicts. Resolve them before implementing the feature. Use `git log --all --oneline` and `git diff` to reason about each parent.

## Step 3: Implement per the PRD

Follow agent-config conventions: TDD (via `superpowers:test-driven-development`), `superpowers:systematic-debugging` on failures, smallest reasonable changes. The PRD drives the scope.

## Step 4: Verify tests pass

All tests must pass before handoff. If not, fix them — do not suppress, skip, or delete.

## Step 5: Invoke `/prepare-for-review` (conditional)

If Steps 3–4 succeeded, invoke `/prepare-for-review`. That skill runs the doc sweep, decisions capture, codex review, posts the handoff comment, and transitions Linear to `In Review`.

If any step failed, do NOT invoke `/prepare-for-review`. Leave the Linear issue in `In Progress`. The orchestrator's post-dispatch state check classifies this as `exit_clean_no_review` (labels `ralph-failed`, taints downstream issues) — that's the correct operator signal.

## Red flags / when to stop

Stop the session WITHOUT invoking `/prepare-for-review` if:

- The `$ISSUE_ID` argument is missing.
- The PRD is empty or clearly malformed.
- Merge conflicts from pre-merged parents can't be resolved confidently.
- Tests fail and can't be fixed within the session.
- The `linear` CLI is unreachable (can't read the PRD).

Never invoke `/prepare-for-review` to "complete" a session that didn't actually succeed. The skill itself guards against this, but act on the red flags here first — the `exit_clean_no_review` outcome is the correct signal.
````

- [x] **Step 2: Verify the skill file exists**

```bash
test -f agent-config/skills/ralph-implement/SKILL.md && echo OK
```

Expected output: `OK`

- [x] **Step 3: Commit**

```bash
git add agent-config/skills/ralph-implement/SKILL.md
git commit -m "ralph-implement: add dispatched-skill workflow (ENG-206)"
```

---

## Task 2: Replace orchestrator dispatch (TDD)

**Files:**
- Test: `agent-config/skills/ralph-start/scripts/test/orchestrator.bats`
- Modify: `agent-config/skills/ralph-start/scripts/orchestrator.sh:16-18,449-452`

- [x] **Step 1: Add a failing test for the new dispatch shape**

Open `agent-config/skills/ralph-start/scripts/test/orchestrator.bats`. Find the test `"single issue success: outcome=in_review, .ralph-base-sha present, Linear set to In Progress"` (starts at line 219). Inside that test, after the existing assertion `[[ "$sha" =~ ^[0-9a-f]{40}$ ]]` and before `# progress.json has exactly one in_review record`, add:

```bash
  # claude was invoked with /ralph-implement as the dispatch prompt
  grep -qF "/ralph-implement ENG-10" "$STUB_CLAUDE_ARGS_FILE"
```

- [x] **Step 2: Run the test — verify it FAILS**

```bash
cd agent-config/skills/ralph-start/scripts/test && bats orchestrator.bats -f "single issue success"
```

Expected: FAIL, with the `grep -qF "/ralph-implement ENG-10"` assertion failing because the orchestrator currently renders the old template, which does not contain `/ralph-implement`.

- [x] **Step 3: Update orchestrator.sh dispatch**

In `agent-config/skills/ralph-start/scripts/orchestrator.sh`, replace lines 448-452 (the template-render block):

```bash
  # Render prompt
  local prompt="${RALPH_PROMPT_TEMPLATE//\$ISSUE_ID/$issue_id}"
  prompt="${prompt//\$ISSUE_TITLE/$title}"
  prompt="${prompt//\$BRANCH_NAME/$branch}"
  prompt="${prompt//\$WORKTREE_PATH/$path}"
```

with:

```bash
  # Dispatch prompt: invoke ralph-implement with the issue ID.
  # The agent reads title from Linear, branch from git, and runs in the
  # worktree as cwd — none of those need substituting here.
  local prompt="/ralph-implement $issue_id"
```

- [x] **Step 4: Update orchestrator.sh header comment**

In `agent-config/skills/ralph-start/scripts/orchestrator.sh`, find the header block at lines 16-18:

```bash
# Required env: RALPH_IN_PROGRESS_STATE, RALPH_REVIEW_STATE, RALPH_FAILED_LABEL,
#               RALPH_WORKTREE_BASE, RALPH_MODEL, RALPH_STDOUT_LOG,
#               RALPH_PROMPT_TEMPLATE.
```

Replace with:

```bash
# Required env: RALPH_IN_PROGRESS_STATE, RALPH_REVIEW_STATE, RALPH_FAILED_LABEL,
#               RALPH_WORKTREE_BASE, RALPH_MODEL, RALPH_STDOUT_LOG.
```

- [x] **Step 5: Drop the obsolete env var export in the test setup**

In `agent-config/skills/ralph-start/scripts/test/orchestrator.bats`, delete line 35:

```bash
  export RALPH_PROMPT_TEMPLATE='Issue: $ISSUE_ID Title: $ISSUE_TITLE Branch: $BRANCH_NAME Path: $WORKTREE_PATH'
```

- [x] **Step 6: Run the test — verify it PASSES**

```bash
cd agent-config/skills/ralph-start/scripts/test && bats orchestrator.bats -f "single issue success"
```

Expected: PASS.

- [x] **Step 7: Run the full orchestrator.bats suite to check for regressions**

```bash
cd agent-config/skills/ralph-start/scripts/test && bats orchestrator.bats
```

Expected: all tests pass.

- [x] **Step 8: Commit**

```bash
git add agent-config/skills/ralph-start/scripts/orchestrator.sh \
        agent-config/skills/ralph-start/scripts/test/orchestrator.bats
git commit -m "orchestrator: dispatch /ralph-implement instead of rendered template (ENG-206)"
```

---

## Task 3: Drop `prompt_template` from config loader (TDD)

**Files:**
- Test: `agent-config/skills/ralph-start/scripts/test/config.bats`
- Modify: `agent-config/skills/ralph-start/config.json`
- Modify: `agent-config/skills/ralph-start/config.example.json`
- Modify: `agent-config/skills/ralph-start/scripts/lib/config.sh:14-17,33`

- [x] **Step 1: Rewrite the "exports all RALPH_* vars" test**

In `agent-config/skills/ralph-start/scripts/test/config.bats`, find the test starting at line 22. Replace the two `prompt` lines (48-50):

```bash
  # Capture RALPH_PROMPT_TEMPLATE directly to verify multi-line value is intact
  prompt="$(bash -c 'source "$1" "$2" && printf "%s" "$RALPH_PROMPT_TEMPLATE"' _ "$CONFIG_SH" "$EXAMPLE_CONFIG")"
  [[ "$prompt" == *"prepare-for-review"* ]]
```

with:

```bash
  # RALPH_PROMPT_TEMPLATE is no longer exported — the workflow lives in the
  # ralph-implement skill (ENG-206).
  [[ "$output" != *"RALPH_PROMPT_TEMPLATE="* ]]
```

- [x] **Step 2: Update the missing-key fixture**

In `agent-config/skills/ralph-start/scripts/test/config.bats` at lines 62-72, the fixture includes `"prompt_template": "some prompt"` at line 70. Remove that line so the fixture reflects the new required-keys set:

```json
{
  "project": "Agent Config",
  "approved_state": "Approved",
  "review_state": "In Review",
  "failed_label": "ralph-failed",
  "worktree_base": ".worktrees",
  "stdout_log_filename": "ralph-output.log"
}
```

Also check that the file content before the `EOF` line still has the preceding line ending with a `,` converted to no-comma since the last entry changed.

The final fixture (delete the `,` after `"ralph-output.log"` because it's now the last entry):

```json
{
  "project": "Agent Config",
  "approved_state": "Approved",
  "review_state": "In Review",
  "failed_label": "ralph-failed",
  "worktree_base": ".worktrees",
  "stdout_log_filename": "ralph-output.log"
}
```

- [x] **Step 3: Run config.bats — verify it FAILS**

```bash
cd agent-config/skills/ralph-start/scripts/test && bats config.bats
```

Expected: the "valid config exports all RALPH_* vars" test FAILS because `RALPH_PROMPT_TEMPLATE` is still in the env output (config.sh still exports it).

- [x] **Step 4: Drop `prompt_template` from both config.json files**

In `agent-config/skills/ralph-start/config.json`, delete line 11 (the `prompt_template` line). After this, the file should be:

```json
{
  "project": "Agent Config",
  "approved_state": "Approved",
  "in_progress_state": "In Progress",
  "review_state": "In Review",
  "done_state": "Done",
  "failed_label": "ralph-failed",
  "worktree_base": ".worktrees",
  "model": "opus",
  "stdout_log_filename": "ralph-output.log"
}
```

Note the comma removed from line 10 — `"stdout_log_filename": "ralph-output.log"` is now the last entry.

Apply the identical change to `agent-config/skills/ralph-start/config.example.json`.

- [x] **Step 5: Drop the key entry from the config loader**

In `agent-config/skills/ralph-start/scripts/lib/config.sh`, delete line 33:

```bash
    "RALPH_PROMPT_TEMPLATE:prompt_template"
```

Also update the header comment at lines 14-17:

```bash
# Exports:
#   RALPH_PROJECT, RALPH_APPROVED_STATE, RALPH_IN_PROGRESS_STATE,
#   RALPH_REVIEW_STATE, RALPH_DONE_STATE, RALPH_FAILED_LABEL,
#   RALPH_WORKTREE_BASE, RALPH_MODEL, RALPH_STDOUT_LOG, RALPH_PROMPT_TEMPLATE
```

Replace with:

```bash
# Exports:
#   RALPH_PROJECT, RALPH_APPROVED_STATE, RALPH_IN_PROGRESS_STATE,
#   RALPH_REVIEW_STATE, RALPH_DONE_STATE, RALPH_FAILED_LABEL,
#   RALPH_WORKTREE_BASE, RALPH_MODEL, RALPH_STDOUT_LOG
```

- [x] **Step 6: Run config.bats — verify it PASSES**

```bash
cd agent-config/skills/ralph-start/scripts/test && bats config.bats
```

Expected: all tests pass.

- [x] **Step 7: Commit**

```bash
git add agent-config/skills/ralph-start/config.json \
        agent-config/skills/ralph-start/config.example.json \
        agent-config/skills/ralph-start/scripts/lib/config.sh \
        agent-config/skills/ralph-start/scripts/test/config.bats
git commit -m "config: drop prompt_template (workflow moved to ralph-implement skill) (ENG-206)"
```

---

## Task 4: Stale prose references in adjacent files

**Files:**
- Modify: `agent-config/skills/ralph-start/SKILL.md:18`
- Modify: `agent-config/skills/ralph-start/scripts/lib/worktree.sh:36`
- Modify: `agent-config/skills/prepare-for-review/SKILL.md:14,21`
- Modify: `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md:28`

- [x] **Step 1: Update ralph-start prereqs list**

In `agent-config/skills/ralph-start/SKILL.md` line 18, replace:

```
- `config.json` present in the skill directory (copy from `config.example.json` and customize, or rely on the committed default). Required keys: `project`, `approved_state`, `in_progress_state`, `review_state`, `done_state`, `failed_label`, `worktree_base`, `model`, `stdout_log_filename`, `prompt_template`. The four state-name keys must match the actual workflow state names in your Linear workspace.
```

with:

```
- `config.json` present in the skill directory (copy from `config.example.json` and customize, or rely on the committed default). Required keys: `project`, `approved_state`, `in_progress_state`, `review_state`, `done_state`, `failed_label`, `worktree_base`, `model`, `stdout_log_filename`. The four state-name keys must match the actual workflow state names in your Linear workspace.
```

- [x] **Step 2: Update `lib/worktree.sh` comment**

In `agent-config/skills/ralph-start/scripts/lib/worktree.sh` line 36, replace:

```
#     them. The agent's prompt template tells it to handle conflicts before
```

with:

```
#     them. The `ralph-implement` skill tells it to handle conflicts before
```

- [x] **Step 3: Update `prepare-for-review/SKILL.md` lines 14 and 21**

In `agent-config/skills/prepare-for-review/SKILL.md`, replace line 14:

```
- **At the end of an autonomous ralph-loop session** — the orchestrator prompt template names `/prepare-for-review` as the session's closing step.
```

with:

```
- **At the end of an autonomous ralph-loop session** — the `ralph-implement` skill's terminal step invokes `/prepare-for-review`.
```

And replace line 21:

```
In ralph-loop sessions, the issue ID is in the prompt template. In interactive sessions, derive it from the branch name:
```

with:

```
In ralph-loop sessions, the agent receives the issue ID as the `/ralph-implement` invocation argument and exposes it as `$ISSUE_ID`. In interactive sessions, derive it from the branch name:
```

- [x] **Step 4: Annotate ralph v2 spec Decision 2 as superseded**

In `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md`, find line 28:

```
### 2. Minimal prompt template; trust CLAUDE.md and skill descriptions
```

Immediately after it (before line 30 which begins "The prompt template given..."), insert a new paragraph:

```

> **Superseded by ENG-206** — see `2026-04-21-ralph-implement-skill-design.md`. The prompt template described below was replaced by a dispatched skill, `ralph-implement`, in April 2026. The rationale and tradeoffs captured here remain useful as a point-in-time record.

```

(Add a blank line before `>` and after the `>` paragraph so the block-quote renders standalone.)

- [x] **Step 5: Verify no remaining stale references**

```bash
grep -rn "prompt_template\|prompt template" agent-config/ \
  --include='*.md' --include='*.sh' --include='*.json' \
  | grep -v 'agent-config/docs/specs/2026-04-21-ralph-implement-skill-design.md' \
  | grep -v 'agent-config/docs/specs/2026-04-15-spec-queue-orchestrator-design.md' \
  | grep -v 'agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md' \
  | grep -v 'agent-config/docs/plans/2026-04-18-ralph-v2-rollout.md' \
  | grep -v 'agent-config/superpowers-overrides/subagent-driven-development/SKILL.md'
```

Expected: empty output (the excluded files are the new spec, superseded historical specs, the completed v2 rollout plan, and the unrelated subagent-driven-development skill override).

- [x] **Step 6: Commit**

```bash
git add agent-config/skills/ralph-start/SKILL.md \
        agent-config/skills/ralph-start/scripts/lib/worktree.sh \
        agent-config/skills/prepare-for-review/SKILL.md \
        agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md
git commit -m "docs: align prose with ralph-implement skill (ENG-206)"
```

---

## Task 5: Full test suite green baseline

**Files:**
- None (test run only).

- [x] **Step 1: Run the full bats suite**

```bash
cd agent-config/skills/ralph-start/scripts/test && bats .
```

Expected: all `.bats` files pass. If any fail unrelated to this change, stop and investigate — do not proceed with handoff with pre-existing failures.

- [x] **Step 2: Spot-check rendered config loading end-to-end**

```bash
cd /tmp && bash -c '
  source /Users/seankao/.local/share/chezmoi/.worktrees/eng-206/agent-config/skills/ralph-start/scripts/lib/config.sh \
    /Users/seankao/.local/share/chezmoi/.worktrees/eng-206/agent-config/skills/ralph-start/config.example.json
  env | grep "^RALPH_" | sort
'
```

Expected output includes every `RALPH_*` var EXCEPT `RALPH_PROMPT_TEMPLATE`. Specifically:

```
RALPH_APPROVED_STATE=Approved
RALPH_CONFIG_LOADED=/Users/seankao/.local/share/chezmoi/.worktrees/eng-206/agent-config/skills/ralph-start/config.example.json
RALPH_DONE_STATE=Done
RALPH_FAILED_LABEL=ralph-failed
RALPH_IN_PROGRESS_STATE=In Progress
RALPH_MODEL=opus
RALPH_PROJECT=Agent Config
RALPH_REVIEW_STATE=In Review
RALPH_STDOUT_LOG=ralph-output.log
RALPH_WORKTREE_BASE=.worktrees
```

No `RALPH_PROMPT_TEMPLATE` line.

- [x] **Step 3: Final commit of any cleanup discovered during verification**

If Steps 1-2 surfaced any residual issues (stale doc references, missed `RALPH_PROMPT_TEMPLATE` mentions), fix them inline and commit:

```bash
git add <files>
git commit -m "cleanup: <specific fix> (ENG-206)"
```

If nothing needs fixing, skip this step.

---

## Validation plan (post-implementation, out of SDD scope)

Implementation is complete when Task 5's green baseline is achieved. The following are for Sean's manual verification, documented here so they're not lost:

1. **Manual dogfood:** run `/ralph-start` on a low-stakes Approved Linear issue. Expected observables:
   - Claude stub captures `/ralph-implement <ID>` as the dispatch prompt.
   - Session invokes `/ralph-implement`, reads PRD, implements, reaches `/prepare-for-review`.
   - Linear transitions to `In Review`; `progress.json` records `outcome: in_review`.

2. **Empirical test for option A's enforcement claim (sample size ~3-5 dispatches):** track `exit_clean_no_review` rate. If it doesn't drop visibly, the enforcement bet didn't pay off (concern #2's cleanup still stands regardless). File a follow-up if warranted — this plan does not.

3. **If `claude -p "/ralph-implement ENG-NNN"` doesn't correctly trigger the skill:** fall back to a natural-language dispatch prompt. Change `orchestrator.sh`'s `local prompt="/ralph-implement $issue_id"` to something like `local prompt="Invoke the /ralph-implement skill for $issue_id."`. This is a one-line fix; file a follow-up if needed.
