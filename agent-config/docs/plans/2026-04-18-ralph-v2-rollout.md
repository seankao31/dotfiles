# Ralph Loop v2 Rollout Plan

> **For agentic workers:** This plan coordinates a rollout spanning multiple Linear tickets — not a single feature. Each per-ticket section is a self-contained task list executable cold (by a fresh session). Tickets are independent units of work; do NOT attempt to execute all of them in one session. For any individual ticket, use `superpowers:subagent-driven-development` if the ticket decomposes into parallelizable tasks; use linear TDD steps otherwise. Steps use checkbox (`- [ ]`) syntax for tracking. Each per-ticket section ends with the standard review gate (codex-review-gate before declaring done).

**Goal:** Ship the ralph v2 autonomous spec-queue orchestrator and its supporting skills/hooks, so Sean can queue approved Linear issues and have them worked overnight with human review happening at review-time, not dispatch-time.

**Architecture:** The design doc at `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md` is the source of truth. Two critical-path tickets (ENG-182, ENG-184) must ship sequentially; four parallel-track tickets (ENG-185, ENG-186, ENG-177, ENG-178) can land independently. The orchestrator is a skill-with-bundled-scripts inside this repo's `agent-config/skills/` tree, not a standalone plugin.

**Tech Stack:** bash + bats-core (orchestrator scripts & tests), `linear` CLI (Linear integration), `claude -p` (auto mode) for spec execution, chezmoi (host of the skills and hooks), git worktrees (per-spec isolation), Linear workflow states (queue semantics).

---

## Progress Log

Newest entry first. Each entry records: date, session summary, current state of each ticket, any blockers/decisions for the next session to pick up.

### 2026-04-19 (session: handoff to a new session after ENG-182/186 merged)

**What happened between sessions:**
- Sean reviewed and merged ENG-182 and ENG-186 to main. Both are now **Done** in Linear.
- ENG-186 was relocated during merge to `.claude/skills/close-feature-branch/` (project-local `.claude/skills/` rather than `agent-config/skills/`). This makes it invokable as a project-local slash command without chezmoi symlink plumbing.
- Sean filed three follow-up tickets from the review:
  - **ENG-197** — "Reorder close-feature-branch skill: detach HEAD + worktree-remove-last." **State: Approved, priority ⚠⚠⚠ (urgent).** Fixes an issue in ENG-186's close ritual.
  - **ENG-193** — "update-stale-docs: accept explicit base SHA instead of relying on working-tree diff." State: Backlog. Resolves the known limitation flagged in yesterday's design decisions (item 2).
  - **ENG-194** — "prepare-for-review: paginate Linear comment list in dedup check." State: Backlog. Addresses the P3 pagination limitation documented in ENG-182's SKILL.md.

**Ticket status snapshot (2026-04-19):**
- ENG-182: **Done** ✓
- ENG-186: **Done** ✓ (relocated to `.claude/skills/`)
- ENG-197: **Approved, urgent** — NEW follow-up to ENG-186; ready for autonomous pickup.
- ENG-184: **Todo**, unblocked. Critical-path: the orchestrator itself.
- ENG-185: **Todo**, still stopped at discovery — awaits Sean's design decision on git hook install mechanism (see 2026-04-18 entry for findings).
- ENG-193, ENG-194: **Backlog** — lower priority, not blocking anything.
- ENG-177, ENG-178: **Todo** — R&D experiments, need Sean's subjective evaluation.

**Recommended priority for the next session:**
1. ENG-197 (Approved + urgent; fixes something Sean already merged).
2. ENG-185 — once Sean picks the install mechanism.
3. ENG-184 — the big one.
4. ENG-193, ENG-194 — backlog cleanup.
5. ENG-177, ENG-178 — need Sean's involvement, not autonomous work.

**Open design questions carried forward:**
- ENG-185: global `core.hooksPath` via chezmoi `run_once_` vs. per-repo vs. other? Unanswered.
- ENG-184 open questions: Q2 (permission-prompt deadlock) remains contested; test empirically at Task 8.

### 2026-04-18 (session: plan reconstruction + autonomous rollout start)

**What happened:**
- Reconstructed this plan from scratch after the ENG-176 worktree was force-removed with the original plan.md untracked (unrecoverable).
- Resolved open questions Q1, Q3, Q4 with Sean's answers; flagged Q2 as contested with pointers to design doc lines 185 and 468.
- Renamed skill from `run-queue` to `ralph-start` throughout the plan (Q4 resolution). ENG-184 ticket description still says `run-queue` — update it during ENG-184 execution.
- Started autonomous execution: ENG-182 in a dedicated worktree.

**Ticket status at end of session:**
- ENG-182: **In Review** ✓ — SKILL.md complete, 24 Codex review passes, handoff comment posted. Branch: `eng-182-create-prepare-for-review-skill`. Key open design item for ENG-184: orchestrator must write `.ralph-base-sha` to each worktree before dispatch.
- ENG-186: **In Review** ✓ — close-feature-branch SKILL.md complete, 5 Codex review passes, handoff comment posted. Branch: `eng-186-project-local-close-feature-branch-skill-for-chezmoi`. Has a forward-reference to `/prepare-for-review` that works once ENG-182 ships.
- ENG-184: Not started (unblocked once ENG-182 merges)
- ENG-185: **Stopped at discovery phase** — needs Sean's design decision on install mechanism. Findings: no existing git hook infrastructure in this repo (only `.git/hooks/*.sample` files, no `core.hooksPath` set globally or locally, no `.githooks/` dir). The `agent-config/hooks/` directory that exists is for Claude Code event hooks, not git hooks. **Design question for Sean:** Should the post-commit git hook install globally (via `git config --global core.hooksPath ~/.config/git/hooks` + chezmoi-managed script), or per-repo, or some other mechanism? The plan's Task 1 says "pause and ask Sean" at this branch point — not proceeding without a decision.
- ENG-177: Not started
- ENG-178: Not started

**Design decisions made this session:**
1. **Sequence reordered from design doc:** Codex review gate runs AFTER docs/decisions updates (Steps 1-3 then Step 4), not before. This ensures the review sees the full final branch state in one pass.
2. **`update-stale-docs` limitation:** It uses `git diff --stat` (working tree diff, empty on clean tree). Work around: provide `git diff "$BASE_SHA" HEAD --stat` as context. Filed as a known limitation — needs a follow-up ticket to make `update-stale-docs` accept a branch base SHA.
3. **`.ralph-base-sha` file:** Orchestrator (ENG-184) must write this to the worktree before dispatch so `prepare-for-review` can scope its review/summary to just the task's commits, not all of main.
4. **Linear CLI is required:** Removed false claim that `linear-workflow` is a fallback for CLI failures — it uses the same CLI binary. If Linear CLI is unavailable, the skill cannot complete.
5. **SHA-based comment dedup** (not header-based): avoids duplicate posting on retry while allowing re-runs after feedback commits.

**Decisions/issues for the next session:**
- ENG-182 and ENG-186 are In Review on their own branches. Sean's review merges both.
- ENG-184 is unblocked once ENG-182 merges. Key contract from ENG-182 for ENG-184: orchestrator.sh must write `.ralph-base-sha` to each worktree at dispatch time (before the session's first commit). This file records the SHA where the session started and is what `prepare-for-review` uses to scope codex review + handoff summary.
- **ENG-185 needs a design decision before it can proceed** — see above. Install mechanism is the blocker.
- ENG-177 and ENG-178 are R&D experiments; not attempted this session (open-ended, not amenable to autonomous execution without Sean's subjective evaluation).
- Open Q #2 (permission-prompt deadlock) remains contested — resolve empirically at the start of ENG-184 Task 8.
- ENG-182 → ENG-184 dependency: ENG-184 orchestrator script must write `.ralph-base-sha` to each worktree at dispatch time (recording `git rev-parse HEAD` before the first commit). This contract is documented in prepare-for-review's SKILL.md and must be implemented in ENG-184's orchestrator.sh.
- ENG-183 is Done but the linear-workflow SKILL.md's graphviz diagram already shows `prepare-for-review` as a handoff node — no updates needed there.
- Consider filing a follow-up ticket to make `update-stale-docs` use branch diff (not working tree diff). Low priority but noted.

---

## 0. Rollout overview

### Source of truth

All design decisions live in `agent-config/docs/specs/2026-04-17-ralph-loop-v2-design.md`. **Do not re-argue decisions in per-ticket plans.** If a plan step here disagrees with the design doc, the design doc wins; file a separate ticket to revise the design first.

### Linear snapshot (2026-04-18)

| Ticket | Title | State | Role |
|---|---|---|---|
| ENG-176 | Design ralph loop v2 | **Done** | Source design doc |
| ENG-181 | Add "Approved" state to ENG team | **Done** | One-time Linear config |
| ENG-183 | Audit `/linear-workflow` for autonomous | **Done** | Skill adjustments merged |
| **ENG-182** | Create `prepare-for-review` skill | **Todo** | Critical-path #1 — blocks ENG-184 |
| **ENG-184** | Implement ralph v2 orchestrator skill | **Todo** | Critical-path #2 — the loop itself |
| ENG-185 | Post-commit stale-parent hook | **Todo** | Parallel track — review-time concern |
| ENG-186 | chezmoi `close-feature-branch` skill | **Todo** | Parallel track — branch closure |
| ENG-177 | Spec-to-plan experiments | **Todo** | Parallel track — upstream R&D |
| ENG-178 | Issue-to-spec brainstorming experiments | **Todo** | Parallel track — upstream R&D |

### Dependency DAG

```
ENG-176 (Done) ──┬─► ENG-181 (Done)
                 ├─► ENG-183 (Done)
                 ├─► ENG-182 ──► ENG-184 ──► (end-to-end dogfooding of)
                 │                             ├─► ENG-177
                 │                             └─► ENG-178
                 ├─► ENG-185 (independent)
                 └─► ENG-186 (independent)
```

- **Hard blocker:** ENG-184 cannot ship until ENG-182 ships.
- **Soft dependency:** ENG-177 and ENG-178's end-to-end validation becomes meaningful once ENG-184 is operational; the experiments themselves can begin anytime.
- **Shipped:** ENG-181 (Approved state exists in Linear), ENG-183 (`/linear-workflow` works inside autonomous sessions) — ENG-184 can rely on both.

### Rollout sequencing strategy

**Recommended order (one session per ticket):**

1. ENG-182 (prepare-for-review skill) — unblocks ENG-184
2. ENG-184 (orchestrator) — the main deliverable
3. ENG-186 (close-feature-branch skill) — needed for Sean's merge ritual post-ralph-run
4. ENG-185 (stale-parent hook) — nice-to-have review-time safety net
5. ENG-177 / ENG-178 (upstream experiments) — can run any time after ENG-184 is operational

Parallel tracks (ENG-185, ENG-186) can interleave with the critical path if Sean wants variety. The only strict order is ENG-182 before ENG-184.

### Cross-cutting prerequisite: set Linear `blocked-by` relations

**This is in-scope rollout work without its own ticket.** The orchestrator uses Linear's `blocked-by` relations for DAG ordering and base-branch selection. As of the snapshot date none of the rollout tickets have these relations set. Before dogfooding ENG-184, set:

- ENG-184 ←(blocked by)— ENG-182
- ENG-177 ←(blocked by)— ENG-184 *(for end-to-end validation of experiments through the orchestrator)*
- ENG-178 ←(blocked by)— ENG-184 *(likewise)*

ENG-185, ENG-186 have no blockers per the design.

Use `linear issue update` (verify exact relation-add flag via `linear issue update --help` at the time of running). This is a one-off Linear admin action, not a code change.

### Open questions from the design doc (status as of 2026-04-18)

| # | Question | Status |
|---|---|---|
| 1 | Auto-mode CLI flag for `claude -p` | **Resolved:** `claude --permission-mode auto`. `claude auto-mode defaults` prints built-in classifier rules as JSON. Reference: https://code.claude.com/docs/en/permission-modes#eliminate-prompts-with-auto-mode |
| 2 | Permission-prompt deadlock handling | **Contested.** Design doc raises this at lines 185 and 468 (Decision 9 + Open Q #2), but Sean disputes it's a real issue. Likely resolution path: empirically test whether `--permission-mode auto` *blocks* on non-auto-approved actions or *fails fast*. If fails fast, no deadlock — `ralph-failed` already handles it. If blocks, revisit. Test at the start of ENG-184 Task 8. |
| 3 | Session persistence horizon | **Resolved:** Conversation history is stored in `~/.claude/projects/` and is not GC'd. `claude --resume` remains available indefinitely. `progress.json` doesn't need expiration guards. |
| 4 | Slash-command naming | **Resolved:** `/ralph-start`. Skill lives at `agent-config/skills/ralph-start/`. (Ticket description still says `/run-queue` — update the ticket during ENG-184 execution.) |
| — | Linear comment format for review summary + QA plan | Defined inline in ENG-182 Task 3. |

---

## 1. ENG-182: Create `prepare-for-review` skill

**Goal:** A global skill `prepare-for-review` that wraps implementation handoff — runs docs/decisions/prune/codex-review, posts a Linear comment with review summary + QA plan, moves the issue to In Review.

**Design reference:** `2026-04-17-ralph-loop-v2-design.md` — Decision 3.

**Files:**
- Create: `agent-config/skills/prepare-for-review/SKILL.md`

**Notes before starting:**
- Study the frontmatter format of existing skills in `agent-config/skills/` (see `codex-review-gate/SKILL.md`, `linear-workflow/SKILL.md` for reference).
- `linear-workflow/SKILL.md` already references `prepare-for-review` as a valid handoff point — the skill's graphviz `handoff` node names it explicitly. The new skill must end by calling `/linear-workflow` for the In Review transition (not by calling the Linear CLI directly).
- This skill is useful outside the ralph loop too (interactive "I just finished a feature" handoff), so the SKILL.md should not assume autonomous context.

### Task 1: Scaffold the skill file

**Files:** Create `agent-config/skills/prepare-for-review/SKILL.md`.

- [ ] **Step 1:** Create the skill file with frontmatter matching repo conventions:

```markdown
---
name: prepare-for-review
description: Use when implementation is complete and tests pass, before handing off for human review. Runs doc/decision updates, code review, posts a Linear comment with a review summary and QA plan, and moves the issue to In Review. Useful at the tail of autonomous ralph-loop sessions AND interactive "I just finished this feature" handoffs.
model: sonnet
allowed-tools: Skill, Bash(linear:*), Read, Glob, Grep, Write, Edit
---

# Prepare for Review

Hand-off checklist for "implementation is done, tests pass, now it needs human review."
```

- [ ] **Step 2:** Commit scaffold.

```bash
git add agent-config/skills/prepare-for-review/SKILL.md
git commit -m "scaffold prepare-for-review skill (ENG-182)"
```

### Task 2: Document the handoff sequence (steps 1-4)

- [ ] **Step 1:** Add the skill body describing the sequence from Decision 3 of the design doc:

```markdown
## When to Use

- **At the end of an autonomous ralph-loop session** — the prompt template names `/prepare-for-review` as the entry point.
- **At the end of an interactive implementation session** — when Sean finishes a feature and wants the handoff polish done consistently.

## The Sequence (run in order)

### Step 1: Update stale docs

Invoke `update-stale-docs` skill. Ensures READMEs, inline comments, doc files reflect the new code behavior.

### Step 2: Capture decisions

Invoke `capture-decisions` skill. Records any non-obvious implementation choices made during the session — the why, not the what.

### Step 3: Prune completed docs

Invoke `prune-completed-docs` skill. Removes or archives now-stale planning docs, decision scratch, etc.

### Step 4: Codex review gate

Invoke `codex-review-gate` skill (final-branch mode). Iterate on findings — the review may result in code changes, which is expected and correct. Re-run if code changes were made.
```

- [ ] **Step 2:** Commit.

```bash
git add agent-config/skills/prepare-for-review/SKILL.md
git commit -m "document first four handoff steps in prepare-for-review (ENG-182)"
```

### Task 3: Define the Linear comment format

**Open question resolved here:** The design doc names "review summary" and "QA test plan" but does not prescribe exact structure. Pick a template; document it inline in the skill.

- [ ] **Step 1:** Append to the skill:

```markdown
### Step 5: Post Linear handoff comment

Post a comment on the Linear issue using this template. Fill every section; empty sections signal the skill was run mechanically.

~~~markdown
## Review Summary

**What shipped:** <1-3 sentence summary of implementation>

**Deviations from the PRD:** <bulleted list of anything that differs from the issue description; "None" if identical>

**Surprises during implementation:** <bulleted list of things the PRD didn't anticipate; "None" if clean>

## QA Test Plan

**Golden path:** <specific manual steps to verify the core behavior works>

**Edge cases worth checking:** <bulleted list of risky paths — what was tricky to get right, what boundary conditions exist>

**Known gaps / deferred:** <anything intentionally left unfinished; "None" if complete>

## Commits in this branch

<output of `git log --oneline <base>..HEAD`>
~~~

Use `linear issue comment <issue-id>` (verify exact CLI syntax via `linear issue comment --help` or `linear-cli` skill at invocation time; do not guess flags).
```

- [ ] **Step 2:** Commit.

```bash
git add agent-config/skills/prepare-for-review/SKILL.md
git commit -m "define Linear handoff comment template (ENG-182)"
```

### Task 4: Document the state transition handoff

- [ ] **Step 1:** Append to the skill:

```markdown
### Step 6: Move issue to In Review via /linear-workflow

Invoke the `linear-workflow` skill (or slash command `/linear-workflow` if in an interactive session). Request the `In Progress → In Review` transition.

DO NOT call the `linear` CLI directly to change state. The `linear-workflow` skill handles idempotency (the orchestrator may have already moved the issue to In Progress externally) and any pre-transition validation.

Reference: see the `linear-workflow` skill for state-machine semantics. ENG-183 audited this skill for autonomous-session compatibility; it handles the case where the state has already been changed externally.
```

- [ ] **Step 2:** Commit.

```bash
git add agent-config/skills/prepare-for-review/SKILL.md
git commit -m "document In Review handoff via linear-workflow (ENG-182)"
```

### Task 5: Add a red-flag / failure section

- [ ] **Step 1:** Append to the skill:

```markdown
## Red Flags / When to Stop

- **Tests are failing:** Do NOT run `/prepare-for-review`. Fix tests first. This skill is for handoff, not for papering over incomplete work.
- **codex-review-gate returns blocking findings:** Fix them, re-run the gate. Do not move to In Review with known blocking issues unsurfaced.
- **QA test plan is empty or generic:** Stop and actually think about what a reviewer would need to verify. A handoff comment that says "verify it works" is a failure of this skill.
- **Deviations from PRD are substantial enough they need discussion:** Post the comment anyway (Sean will see it at review time), but flag loudly in the Review Summary section.
```

- [ ] **Step 2:** Commit.

```bash
git add agent-config/skills/prepare-for-review/SKILL.md
git commit -m "document red flags and stop-conditions (ENG-182)"
```

### Task 6: Verify and finish

- [ ] **Step 1:** Read the full SKILL.md end-to-end. Check that:
  - Frontmatter fields match those in `codex-review-gate/SKILL.md` and `linear-workflow/SKILL.md`.
  - Description is specific enough that Claude will auto-invoke it at the right time (autonomous sessions via the ralph prompt, interactive sessions after finishing work).
  - `allowed-tools` covers every tool actually used.
  - Every referenced skill (`update-stale-docs`, `capture-decisions`, `prune-completed-docs`, `codex-review-gate`, `linear-workflow`) exists in `agent-config/skills/` or the superpowers plugin.

- [ ] **Step 2:** Manually dry-run the skill on a throwaway finished feature branch. The test is *invocation*, not code behavior — can Claude read the skill and follow the sequence without ambiguity? Fix any step that requires Sean to guess.

- [ ] **Step 3:** Invoke `codex-review-gate` on the skill file.

- [ ] **Step 4:** Update `linear-workflow/SKILL.md` only if ENG-183's audit left any "prepare-for-review doesn't exist yet" placeholders — most likely the reference is already forward-looking and needs no change.

- [ ] **Step 5:** Run `/prepare-for-review` on this ticket itself (meta — eat our own dogfood). The Linear comment format and review summary should be generated by running the skill on its own implementation branch.

- [ ] **Step 6:** Close via project-local close skill once ENG-186 ships. Until then, close by hand per Sean's rebase+ff-only preference.

---

## 2. ENG-184: Implement ralph v2 orchestrator skill

**Goal:** A skill at `agent-config/skills/ralph-start/` with bundled shell scripts that implements the autonomous spec-queue orchestrator — pre-flight sanity scan, topological sort, DAG-aware base-branch selection, dispatch loop with downstream-taint on failure, progress.json audit trail.

**Design reference:** `2026-04-17-ralph-loop-v2-design.md` — Architecture, Components, all Decisions.

**Prerequisites (verify before starting):**
- [ ] ENG-182 is Done and merged. (The prompt template references `/prepare-for-review`; the skill must exist.)
- [ ] ENG-181 is Done. (`Approved` state exists in Linear — verify via `linear state list --team ENG`.)
- [ ] ENG-183 is Done. (`/linear-workflow` works in autonomous sessions — already merged per current state.)
- [ ] Blocked-by relation set in Linear: ENG-184 blocked by ENG-182.

**Open questions — status before starting ENG-184:**
- Q1 (auto-mode flag) — **resolved** as `claude --permission-mode auto`.
- Q2 (permission-prompt deadlock) — **contested.** Test fails-fast vs. blocks empirically at the start of Task 8. If it fails fast, no special handling needed. If it blocks, revisit.
- Q3 (session persistence) — **resolved**; `~/.claude/projects/` persists indefinitely.
- Q4 (skill name) — **resolved** as `ralph-start`. The ticket description uses `ralph-start` and should be updated during this ticket.

**Scope divergence between design doc and ticket:**
- Design doc uses plugin structure (`spec-queue/PLUGIN.md + skills/ralph-start/ + scripts/`).
- Ticket description uses skill structure (`agent-config/skills/run-queue/` with bundled scripts — use `ralph-start` per Q4 resolution, and update the ticket description during this ticket).
- **Follow the ticket's skill form.** The skill form fits existing `agent-config/skills/` conventions; plugin-ification is a larger change and not in scope.

**Files (all new):**
- Create: `agent-config/skills/ralph-start/SKILL.md` — slash-command entry point
- Create: `agent-config/skills/ralph-start/config.example.json`
- Create: `agent-config/skills/ralph-start/scripts/orchestrator.sh`
- Create: `agent-config/skills/ralph-start/scripts/toposort.sh`
- Create: `agent-config/skills/ralph-start/scripts/dag_base.sh`
- Create: `agent-config/skills/ralph-start/scripts/preflight_scan.sh`
- Create: `agent-config/skills/ralph-start/scripts/lib/config.sh`
- Create: `agent-config/skills/ralph-start/scripts/lib/linear.sh`
- Create: `agent-config/skills/ralph-start/scripts/lib/worktree.sh`
- Create: `agent-config/skills/ralph-start/scripts/test/*.bats`

**Task decomposition:** Sub-tasks are *script-level*, not line-level, because this is an autonomous orchestrator where each script is a unit. Within each task, follow bats-TDD (test first, verify fail, minimal impl, verify pass, commit) per the standard skill discipline. When starting this ticket in a fresh session, run `superpowers:subagent-driven-development` to parallelize across scripts where dependencies allow.

### Task 1: Scaffold skill + config

- [ ] **Step 1:** Create skill directory with SKILL.md frontmatter. Description must mark it as human-invoked only:

```markdown
---
name: ralph-start
description: Entry point for Sean to dispatch the autonomous ralph-loop spec-queue. Do NOT auto-invoke. Sean runs this explicitly via /ralph-start before stepping away from the desk.
disable-model-invocation: true
allowed-tools: Bash, Read, Glob, Grep
---
```

Use `disable-model-invocation: true` — this is a Sean-driven trigger, not a Claude-driven one.

- [ ] **Step 2:** Stub `config.example.json` matching the design doc's Component 7 structure. Keys: `project`, `approved_state`, `review_state`, `failed_label`, `worktree_base`, `model`, `stdout_log_filename`, `prompt_template`.

- [ ] **Step 3:** Stub empty scripts + `scripts/lib/` + `scripts/test/`. Scripts have `#!/usr/bin/env bash`, `set -euo pipefail`, and a placeholder body that exits 0. Make all scripts executable.

- [ ] **Step 4:** Commit.

```bash
git add agent-config/skills/ralph-start/
git commit -m "scaffold ralph-start skill and script stubs (ENG-184)"
```

### Task 2: Config loader (`lib/config.sh`)

- [ ] **Step 1:** Write a bats test `scripts/test/config.bats` that:
  - Given a `config.json`, loads keys into exported env vars (`RALPH_PROJECT`, `RALPH_APPROVED_STATE`, etc.).
  - Missing required keys cause exit 1 with a clear error.
  - `config.example.json` as the input parses cleanly.
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement `lib/config.sh` using `jq` for parsing. Export variables with the `RALPH_` prefix.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 3: Linear wrapper (`lib/linear.sh`)

Functions needed (derive from design doc Component 5):
- `linear_list_approved_issues` — returns issue IDs in the project, state=Approved
- `linear_get_issue_blockers <issue_id>` — returns blocker issue IDs + their states (JSON)
- `linear_get_issue_branch <issue_id>` — returns Linear's auto-generated slug
- `linear_set_state <issue_id> <state_name>` — state transition
- `linear_add_label <issue_id> <label>` — label add
- `linear_comment <issue_id> <body>` — post comment

**Important:** Every Linear CLI invocation here should match what `linear-cli` plugin skill documents. When in doubt, run `linear <subcommand> --help` and copy the flag names literally. Do NOT invent flag names.

- [ ] **Step 1:** Write bats tests that stub the `linear` CLI via PATH manipulation and verify each function produces the right invocations (captured via the stub's argv).
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement `lib/linear.sh`.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Manual smoke: pick a real Agent Config Linear issue and call each function against it (in a scratch shell). Verify against the Linear UI.
- [ ] **Step 6:** Commit.

### Task 4: Worktree wrapper (`lib/worktree.sh`)

Functions needed:
- `worktree_create_at_base <path> <branch> <base_branch>` — `git worktree add <path> -b <branch> <base>`
- `worktree_create_with_integration <path> <branch> <parents[]>` — creates at `main`, then `git merge` each parent sequentially without aborting on conflict (let conflicts persist in the working tree for the agent to resolve)
- `worktree_path_for_issue <issue_id>` — computes `$HOME/.claude/worktrees/<branch-slug>`

- [ ] **Step 1:** Write bats tests using a throwaway git repo fixture. Verify:
  - Clean base: worktree created, branch checked out, no unresolved conflicts.
  - Single-parent base: worktree created on parent's branch tip.
  - Integration base: worktree at main, parents merged sequentially, conflicts present in working tree if any.
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement. Key: integration-merge must NOT `git merge --abort` on conflict. Leave conflicts in-place per design Decision 7.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 5: Topological sort (`toposort.sh`)

Kahn's algorithm over `blocked-by` relations. Input: list of issue IDs + each issue's blockers (as fetched via `lib/linear.sh`). Output: ordered list respecting dependencies, with Linear priority as tiebreaker.

- [ ] **Step 1:** Write bats tests covering:
  - Linear chain A→B→C (C blocked by B, B blocked by A): order A, B, C.
  - Diamond A→{B,C}→D: A, then B/C (tiebreaker by priority), then D.
  - Disconnected: two independent chains interleaved by priority.
  - Cycle: error with a clear message.
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement Kahn's in bash. jq for the relation parsing if helpful.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 6: DAG base-branch selection (`dag_base.sh`)

Direct translation of Component 4 pseudo-code:

```bash
# Given an issue, decide the base branch for its worktree.
# Output: one of
#   "main"
#   "<single-parent-branch-name>"
#   "INTEGRATION <parent1-branch> <parent2-branch> ..."
```

- [ ] **Step 1:** Write bats tests:
  - No blockers → `main`.
  - All blockers Done → `main`.
  - One blocker In Review, rest Done → that one's branch.
  - Multiple blockers In Review → `INTEGRATION` with parent list.
  - Any blocker in Approved/In Progress (not yet in Review) → this should be caught by the pickup rule upstream; `dag_base` can assume only pickup-ready issues reach it.
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement. Consumes `lib/linear.sh::linear_get_issue_blockers`.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 7: Pre-flight sanity scan (`preflight_scan.sh`)

Detect anomalies per design Decision 6. For each Approved issue in the project, check and flag:
- Canceled blocker → warn, ask Sean (keep/cancel/edit).
- Duplicate blocker → warn, ask Sean.
- Blocker chain stuck (blocker is Approved, its blockers are not In Review/Done) → warn.
- Approved but no PRD (issue description is empty or trivially short) → warn.

Output: pass (all clear, ready to dispatch) or fail (list of anomalies with issue URLs, non-zero exit).

- [ ] **Step 1:** Write bats tests with stubbed Linear state fixtures covering each anomaly type.
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement. Reads issues via `lib/linear.sh`. "Trivially short PRD" threshold: fewer than N non-whitespace characters — pick N=200, document it.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 8: Orchestrator dispatch loop (`orchestrator.sh`)

The main loop. Consumes: a queue of issue IDs (pre-sorted by `toposort.sh`). Per issue:
1. Compute base via `dag_base`.
2. Create worktree via `worktree_create_at_base` or `worktree_create_with_integration`.
3. Move Linear state: Approved → In Progress via `linear_set_state`.
4. Render prompt from `config.prompt_template` + substitutions.
5. Invoke `claude -p` with `--worktree`, `--name`, **auto mode** flag (resolve Open Q #1), and the rendered prompt. Tee output to `$worktree/ralph-output.log`.
6. Classify by exit code:
   - **0:** trust the session moved state to In Review via `/prepare-for-review`; record in `progress.json`.
   - **non-zero:** `linear_add_label $issue ralph-failed`; mark all transitive descendants as tainted (skip on subsequent iterations); record in `progress.json`.
7. Continue to next issue if not tainted.

- [ ] **Step 1:** Write bats tests. Stub `claude` via PATH manipulation — record invocations, control exit code via env var. Verify:
  - Clean queue: three independent issues, all exit 0 → Linear set to In Progress at dispatch, session assumed to complete, three `progress.json` entries.
  - Failure taints downstream: ENG-A blocks ENG-B; ENG-A exits non-zero → ENG-B skipped, `ralph-failed` label on ENG-A only.
  - Failure does NOT taint independents: ENG-A and ENG-C are independent; ENG-A fails, ENG-C still dispatches.
  - Integration merge: ENG-B blocked by ENG-X, ENG-Y (both In Review) → worktree at `INTEGRATION`, sequential merges applied.
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement, following the shell pseudo-code in design Component 2.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 9: Slash command entry (`SKILL.md`)

Fill in the `ralph-start` SKILL.md body with the workflow from Component 1:
1. Read config.
2. Invoke `preflight_scan.sh`; if failures, stop and ask Sean.
3. Query `linear_list_approved_issues`, filter to strictly pickup-ready (no `ralph-failed`, all blockers ⊆ {Done, In Review}, no Canceled blockers).
4. Invoke `toposort.sh` to order.
5. Dry-run preview: print the queue with base-branch choices, prompt for Sean confirmation.
6. Invoke `orchestrator.sh` with the approved queue.

- [ ] **Step 1:** Write the SKILL.md body inline.
- [ ] **Step 2:** Manual dry-run with an artificial Approved issue (or fixture). Verify the preview output and confirmation flow feel right.
- [ ] **Step 3:** Commit.

### Task 10: Progress file (`progress.json`)

Per-run audit trail as specified in Component 6. Orchestrator appends runs; each run has `run_id` (ISO 8601 with tz), `dispatched` array, `skipped` array.

- [ ] **Step 1:** Write bats tests for the append logic (ensure concurrent runs don't clobber — if two `/ralph-start` invocations overlap, append atomically via a tmpfile+mv).
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement inside `orchestrator.sh` or a small helper in `lib/`.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 11: End-to-end dogfood

- [ ] **Step 1:** Create a throwaway Agent Config Linear issue in Approved state with a trivial PRD ("create a file `test-ralph-v2.txt` with contents `hello`") and no blockers.
- [ ] **Step 2:** Run `/ralph-start`. Confirm preview. Let the dispatch happen.
- [ ] **Step 3:** Observe: worktree created, session dispatched with correct prompt, session completes, Linear state In Review, `progress.json` populated.
- [ ] **Step 4:** If any step fails, diagnose. Do NOT mark the ticket done with a known failure mode — root-cause it per CLAUDE.md.
- [ ] **Step 5:** Clean up the throwaway issue (move to Canceled with a comment noting it was a dogfood test).

### Task 12: Documentation sweep

- [ ] **Step 1:** Update `agent-config/skills/` top-level README (if one exists) to reference the new skill.
- [ ] **Step 2:** Add a short playbook at `agent-config/docs/playbooks/ralph-v2-usage.md` — two paragraphs on "how I use this" from Sean's seat: when to run `/ralph-start`, what to expect, how to triage `ralph-failed` issues on return.
- [ ] **Step 3:** Commit docs.
- [ ] **Step 4:** Invoke `update-stale-docs` skill to catch anything else.

### Task 13: Review gate

- [ ] **Step 1:** Invoke `codex-review-gate` on the branch diff. Address blocking findings.
- [ ] **Step 2:** Re-run end-to-end dogfood (Task 11) if code was changed during review.
- [ ] **Step 3:** Invoke `/prepare-for-review` — eats the dogfood, posts the Linear comment, moves to In Review.
- [ ] **Step 4:** Close via ENG-186's skill once it ships; or manually per Sean's rebase+ff-only preference if earlier.

---

## 3. ENG-185: Post-commit hook for stale-parent detection

**Goal:** Git post-commit hook that, when Sean amends a branch which is a parent of any In-Review Linear issue, labels the child issue with `stale-parent` (and optionally comments with the new HEAD SHA).

**Design reference:** `2026-04-17-ralph-loop-v2-design.md` — Decision 7 (moved out of orchestrator); Follow-up #5.

**Non-goals (per ticket):**
- Not part of the ralph orchestrator — runs independently on every commit.
- No auto-rebase of children. Sean decides at review time.

**Parallel track:** This ticket has no dependencies on ENG-182 or ENG-184. Can land any time.

**Files:**
- Create: a post-commit hook script (location depends on existing chezmoi hook conventions — verify before writing; see "Before coding" below).
- Modify: chezmoi hook-installation mechanism if one exists.

**Before coding — unknowns to resolve:**
- [ ] How does chezmoi currently manage git hooks for this repo and for repos managed through it? Look at `chezmoi cat-config`, `run_*` scripts, and any existing `.git/hooks/` references. Do NOT invent a mechanism — verify.
- [ ] Is there a `.githooks/` or `run_once_install-hooks.sh` already? If so, extend it.
- [ ] Does Sean want this hook installed globally (via `git config --global core.hooksPath`) or per-repo? The design doc doesn't say. Default to per-repo (tied to chezmoi-managed repos) and surface the choice to Sean if it matters for the install mechanism.

### Task 1: Discover the install mechanism

- [ ] **Step 1:** Search the chezmoi source tree for existing hook patterns:

```bash
fd -e sh hook /Users/seankao/.local/share/chezmoi
```

- [ ] **Step 2:** Read any matches. Document the pattern in a scratch note to the session (or inline in the plan if you're updating this document).
- [ ] **Step 3:** If no pattern exists, pause and ask Sean. Do NOT invent one.

### Task 2: Write the detection logic

Logic:
1. Get the branch name of the commit (`git rev-parse --abbrev-ref HEAD`).
2. Query Linear: list issues in state In Review where this branch is the parent of at least one In Review issue. (Parent-of relation: an issue B whose `blocked-by` is an issue A such that A's branch == this branch.)
3. For each such child issue: add label `stale-parent`. Optionally post a comment `Parent branch '<branch>' was amended; new HEAD SHA: <sha>`.

- [ ] **Step 1:** Write a bats test for the detection logic in isolation (stub `linear`, stub `git`).
- [ ] **Step 2:** Run — verify FAIL.
- [ ] **Step 3:** Implement a standalone script at the chezmoi-determined location.
- [ ] **Step 4:** Run — verify PASS.
- [ ] **Step 5:** Commit.

### Task 3: Install hook + verify end-to-end

- [ ] **Step 1:** Wire up the install mechanism per Task 1's discovery.
- [ ] **Step 2:** Run `chezmoi apply` (or whatever applies the repo's changes) and verify the hook is installed in a test repo.
- [ ] **Step 3:** End-to-end: create a throwaway Agent Config issue, set its `blocked-by` to a second throwaway issue that's In Review with a real branch, amend the parent branch, watch the hook fire, verify the child gets the `stale-parent` label.
- [ ] **Step 4:** Commit.

### Task 4: Docs + review gate

- [ ] **Step 1:** Add short docs: what the hook does, how to disable if annoying.
- [ ] **Step 2:** `codex-review-gate`, `/prepare-for-review`.

---

## 4. ENG-186: Project-local `close-feature-branch` skill (chezmoi)

**Goal:** A project-local skill `close-feature-branch` for the chezmoi/agent-config repo. Runs the merge-and-cleanup ritual AFTER Sean has reviewed and is ready to ship.

**Design reference:** `2026-04-17-ralph-loop-v2-design.md` — Decision 4 (project-local close skills replace the generic `finishing-a-development-branch` skill).

**Non-goals (per ticket):** tests, code review, docs — those live in `/prepare-for-review`. Tags, release notes, multi-branch cascades — N/A for this repo.

**Parallel track:** No dependencies. Can land any time.

**Files:**
- Create: `.claude/skills/close-feature-branch/SKILL.md` (project-local at chezmoi repo root, not `agent-config/skills/` — the latter is symlinked to `~/.claude/skills/` and would load globally).

**Critical memory constraints from Sean:**
- **Rebase + ff-only, no merge commits** (`feedback_rebase_merge.md`).
- **Preserve untracked files** (including any untracked plan.md) before removing the worktree (`feedback_preserve_untracked_plans.md` — this is the ENG-176 lesson).

### Task 1: Scaffold

- [ ] **Step 1:** Create `.claude/skills/close-feature-branch/SKILL.md` (repo-root project-local path; not `agent-config/skills/`) with frontmatter:

```markdown
---
name: close-feature-branch
description: Project-local skill for chezmoi/agent-config. Use when Sean has finished reviewing a feature branch and is ready to merge it to main. Runs rebase, fast-forward merge, push, branch deletion, worktree removal, and the Linear Done transition. NOT for multi-branch cascades (dev/staging/main) — this repo is main-only.
model: sonnet
allowed-tools: Bash, Read, Glob, Grep, Skill
---

# Close Feature Branch (chezmoi)
```

- [ ] **Step 2:** Commit.

### Task 2: Document the ritual

- [ ] **Step 1:** Append the ordered steps:

```markdown
## The Ritual (run in order)

### Pre-flight

- Verify: the feature branch has been reviewed (Linear state = In Review, Sean has given the go-ahead).
- Verify: no uncommitted changes in the worktree (`git status` clean).
- **Preserve untracked files.** If the worktree has any untracked files, list them and ask Sean whether to keep (copy them out before worktree removal) or discard. Never blindly discard. Reason: untracked plan.md files have been lost this way before.

### Step 1: Rebase onto latest main

cd into the feature worktree:

~~~bash
git fetch origin main
git rebase origin/main
~~~

If conflicts arise, resolve them or abort (`git rebase --abort`) and escalate to Sean — do NOT auto-resolve silently.

### Step 2: Fast-forward merge to main

cd into the main checkout (NOT the worktree):

~~~bash
cd /Users/seankao/.local/share/chezmoi  # or wherever main lives
git checkout main
git merge --ff-only <feature-branch>
~~~

If the merge is not fast-forward (someone pushed to main between rebase and merge), re-run the rebase.

### Step 3: Push

~~~bash
git push origin main
~~~

### Step 4: Delete the branch

Local and remote:

~~~bash
git branch -d <feature-branch>
git push origin --delete <feature-branch>
~~~

### Step 5: Remove the worktree

**First**: verify no untracked files (re-check per pre-flight).

~~~bash
git worktree remove <worktree-path>
~~~

Do NOT use `--force`. If removal fails, diagnose (usually uncommitted changes or untracked files) — `--force` is the wrong tool and has destroyed work in the past.

### Step 6: Move Linear issue to Done

Invoke `linear-workflow` skill for In Review → Done transition.
```

- [ ] **Step 2:** Commit.

### Task 3: Add red flags

- [ ] **Step 1:** Append:

```markdown
## Red Flags / When to Stop

- **Rebase introduces conflicts you're not confident about:** Abort and escalate. Sean would rather resolve a conflict himself than discover a bad rebase weeks later.
- **`git worktree remove` fails:** Do NOT escalate to `--force`. Check for untracked files, uncommitted changes, open editors. The failure is telling you something.
- **Main has moved during the ritual:** Re-do the rebase. Don't use a merge commit to bridge the gap — see global memory on rebase+ff-only.
- **The issue's Linear state is not In Review:** This skill runs AFTER review, not before. If the issue is still In Progress or Todo, someone skipped a step.
```

- [ ] **Step 2:** Commit.

### Task 4: Verify + review gate

- [ ] **Step 1:** Read SKILL.md end-to-end.
- [ ] **Step 2:** Manual dry-run on a throwaway branch in the repo (e.g., the one this ticket is being worked on — meta again).
- [ ] **Step 3:** `codex-review-gate`.
- [ ] **Step 4:** `/prepare-for-review` → Linear.
- [ ] **Step 5:** Close via... itself. (Meta-close. If this feels circular, merge by hand the first time and let the skill close itself subsequently.)

---

## 5. ENG-177: Spec-to-plan experiments

**Goal:** Evaluate how much plan-writing scaffolding Opus 4.7 actually needs in a fresh-context autonomous run. Produce a recommendation for what the "plan" phase should look like — keep `superpowers:writing-plans`, switch to PRD-only, skip plan entirely, or something in between.

**Design reference:** ENG-177 ticket body. The contract to satisfy: `2026-04-17-ralph-loop-v2-design.md` — Contract summary.

**Nature of this work:** R&D / experimentation. Not TDD. The deliverable is a recommendation document, not code.

**Parallel track:** Can begin any time. End-to-end validation through the orchestrator requires ENG-184 operational.

**Files:**
- Create: `agent-config/docs/experiments/2026-MM-DD-spec-to-plan-evaluation.md` (fill date when done)

### Task 1: Pick candidates to evaluate

- [ ] **Step 1:** List 3–5 candidate plan-shapes. Starting set from the ticket:
  - `superpowers:writing-plans` (baseline — current behavior).
  - PRD-only (no separate plan; ship the issue description as-is).
  - PRD + short outline (a few paragraphs of "approach," not bite-sized TDD).
  - GSD-style.
  - Community ralph variants (mattpocock/skills if documented, snarktank/ralph).
- [ ] **Step 2:** Read each candidate's documentation. Summarize what it produces in 2–3 sentences per candidate.

### Task 2: Design the evaluation

- [ ] **Step 1:** Pick 2–3 representative Agent Config tickets (ideally ones already Done so you have ground truth on "what did the code actually look like"). Write their PRDs fresh.
- [ ] **Step 2:** For each candidate, produce the "plan artifact" that candidate would generate (either by running the skill, or by hand-producing something of that shape).
- [ ] **Step 3:** Dispatch each plan+ticket through ralph (once ENG-184 is operational) or through a mock dispatch (a fresh `claude -p` session with the same prompt template).

### Task 3: Score outcomes

- [ ] **Step 1:** Criteria:
  - Did the session complete without blocking?
  - How many deviations from PRD?
  - Did the session hit obvious dead-ends a plan would have prevented?
  - Time to completion.
- [ ] **Step 2:** Tabulate. Write up the recommendation.

### Task 4: Write + file recommendation

- [ ] **Step 1:** Write the recommendation doc at the file path above.
- [ ] **Step 2:** If the recommendation is "switch to X," file a follow-up ticket to adopt X across the ralph workflow. This ticket closes when the recommendation is filed, not when X is adopted.
- [ ] **Step 3:** `codex-review-gate` on the doc.
- [ ] **Step 4:** `/prepare-for-review` → Linear.

---

## 6. ENG-178: Issue-to-spec brainstorming experiments

**Goal:** Evaluate how to get from "I have a vague idea" to "an Approved issue with a usable PRD." Produce a recommendation for the brainstorming phase.

**Design reference:** ENG-178 ticket body. Contract to satisfy: same as ENG-177.

**Nature of work:** Same shape as ENG-177 — R&D, recommendation doc as output.

**Parallel track:** Same constraints as ENG-177.

**Files:**
- Create: `agent-config/docs/experiments/2026-MM-DD-issue-to-spec-evaluation.md`

### Task 1: Pick candidates

- [ ] **Step 1:** Starting set from the ticket:
  - `superpowers:brainstorming` (baseline).
  - Claude native plan mode (lighter-weight design exploration).
  - GSD.
  - ralph variants.
  - `/grill-me` (mattpocock/skills) — adversarial questioning.
- [ ] **Step 2:** Read each. Summarize.

### Task 2: Design + run the evaluation

Same pattern as ENG-177:

- [ ] **Step 1:** Pick 2–3 candidate ideas that could become issues.
- [ ] **Step 2:** Run each through each candidate brainstorming tool.
- [ ] **Step 3:** Score the output PRDs against the ralph-loop contract (Decision 1): does the PRD contain enough context for Opus 4.7 to implement without human input?

### Task 3: Criteria + tabulation

- [ ] **Step 1:** Criteria:
  - Quality of resulting spec (contract coverage).
  - Time to reach Approved (wall clock).
  - Fit with Sean's thinking style (subjective but important).
- [ ] **Step 2:** Tabulate.

### Task 4: Write + file recommendation

- [ ] **Step 1:** Write the doc.
- [ ] **Step 2:** If the recommendation is to adopt a new tool, file a follow-up to adopt it.
- [ ] **Step 3:** `codex-review-gate` + `/prepare-for-review`.

---

## Self-review (against the design spec)

Spec-coverage check against `2026-04-17-ralph-loop-v2-design.md`:

| Design element | Covered by |
|---|---|
| Decision 1 (single artifact, PRD in Linear description) | Input contract; ENG-177/178 validate the contract |
| Decision 2 (minimal prompt template) | ENG-184 config.example.json `prompt_template` |
| Decision 3 (`prepare-for-review` skill) | ENG-182 |
| Decision 4 (project-local close skills) | ENG-186 (chezmoi); future per-project follow-ups out of scope |
| Decision 5 (Approved state) | ENG-181 (already Done) |
| Decision 6 (strict pickup rule + pre-flight scan) | ENG-184 Task 7 + Task 9 |
| Decision 7 (branch DAG awareness) | ENG-184 Tasks 4, 6 |
| Decision 8 (failure handling: skip downstream, continue independents) | ENG-184 Task 8 |
| Decision 9 (auto mode) | ENG-184 Task 8 (Open Q #1 blocks specifics) |
| Decision 10 (carried from v1) | ENG-184 overall |
| Contract summary | ENG-177, ENG-178 consume |
| Follow-up 1 (implement ralph loop v2) | ENG-184 |
| Follow-up 2 (create `prepare-for-review`) | ENG-182 |
| Follow-up 3 (add Approved state) | ENG-181 (Done) |
| Follow-up 4 (audit `/linear-workflow`) | ENG-183 (Done) |
| Follow-up 5 (post-commit stale-parent hook) | ENG-185 |
| Follow-up 6 (project-local close skill) | ENG-186 |
| Open Q #1 (auto-mode flag) | Resolved: `claude --permission-mode auto` |
| Open Q #2 (permission-prompt deadlock) | Contested; test empirically at ENG-184 Task 8 |
| Open Q #3 (session persistence) | Resolved: `~/.claude/projects/` persists indefinitely |
| Open Q #4 (slash-command naming) | Resolved: `/ralph-start` |
| Open Q #5 (integration-merge cleanup) | Resolved in design ("no cleanup needed"); no task |

Gaps: none identified.

Placeholder scan: Every task has concrete files, concrete commit messages, concrete test expectations. Steps that require knowledge I don't have (chezmoi hook mechanism for ENG-185, auto-mode flag for ENG-184) are marked "verify before coding" with a named resolution path — these are tasks, not TBDs.

Type consistency: The `RALPH_*` env var prefix is used consistently across `lib/config.sh`, `orchestrator.sh`, and dependent scripts. The `worktree_*` / `linear_*` function naming follows the `<module>_<verb>_<object>` pattern consistently.

---

## Execution handoff

This plan is not meant for single-session execution. For each ticket:

1. Start a fresh session (`/clear` if continuing from another ticket).
2. Create a worktree via `superpowers:using-git-worktrees`.
3. Move the Linear issue to In Progress via `/linear-workflow`.
4. Follow the per-ticket section of this plan as the task list.
5. At the end, invoke `/prepare-for-review`.
6. Close via `close-feature-branch` (once ENG-186 ships) or by hand (rebase+ff-only).

For ENG-184 specifically (the largest ticket), once in the worktree consider `superpowers:subagent-driven-development` to parallelize across scripts where dependencies allow (e.g., `lib/config.sh`, `lib/linear.sh`, `lib/worktree.sh` can develop independently once their interfaces are fixed in Task 1).

**Pre-execution reminder per ticket:** read the current state of the design doc. It's the source of truth; this plan is a coordination document. If they disagree, the design doc wins.
