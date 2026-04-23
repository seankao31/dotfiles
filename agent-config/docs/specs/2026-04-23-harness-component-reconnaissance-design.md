# Harness-component reconnaissance — design

**Date:** 2026-04-23
**Relates to:** ENG-178 (ralph v2 workflow evaluation, closed) — refines its arm lists before execution.

## Problem

ENG-178's arm lists for the three ralph v2 pipeline stages (idea → PRD → plan → code) were picked by desk research. Before burning execute-phase cost — shared evaluation machinery, per-arm runs across seeds and tasks — we want to:

1. Verify those arm lists are the right arm lists. Several external skill repos exist that weren't surveyed when the arms were drafted; the winning shape may not be listed.
2. Audit our current stack (own skills, overrides, upstream) against the fit-for-ralph bar. Our stack accreted from upstream choices that may no longer fit. The audit-with-upstream-rationale memory entry applies: for each inherited component, trace why upstream has it, evaluate fit for us, recommend — don't present options neutrally.

Both goals share the same survey machinery, so they run as one workstream.

## Scope

Whole-stack, per-step components only. Four layers audited:

1. **Our in-repo skills.** `ralph-spec`, `ralph-implement`.
2. **Our superpowers overrides.** Everything under `agent-config/superpowers-overrides/` — currently `brainstorming`, `writing-plans`, `subagent-driven-development`, `using-superpowers`, `finishing-a-development-branch`. Audits whether each override still earns its place against current upstream. Two of these (`using-superpowers`, `finishing-a-development-branch`) are not per-step components and fall under auxiliary-skills-out-of-scope by default — they get a thin "override still justified?" audit only, not the full per-step-fit evaluation.
3. **Upstream `obra/superpowers` (non-overridden).** Components touching the ralph pipeline — executing-plans, SDD (if not already audited via our override), any others.
4. **External repos.** `frankbria/ralph-claude-code`, `addyosmani/agent-skills`, `alirezarezvani/claude-skills`. Deeper look at already-referenced `mattpocock/skills` (home of `/grill-me`, listed in ENG-178 Phase 1 arms) and `snarktank/ralph` (listed in ENG-178 Phase 2 arms).

Auxiliary skills (`prepare-for-review`, `close-feature-branch`, `codex-review-gate`, `clean-branch-history`) are **out of scope** unless pulled in as a finding during the audit. They are integration/ritual skills, not per-step components.

## Method

Two-pass read+pilot. Expected total effort: ~1 week wall clock, spread across ~4–6 sessions.

The pilot step invokes skills that touch Linear and worktrees and records narrative observations. Either interactive or autonomous-ralph execution is viable, provided the spec is specific about what "narrative observation" captures (output shape, token/wall-clock, files touched, whether the invariants the component claims actually hold). If ambiguity arises during pass 2, the autonomous session uses the standard exit-clean escape hatch to hand off.

A separate mini-experiment is gated on the pilot's findings and filed as its own ticket.

### Pass 1: read

For each component in scope:
- Read the component's markdown (SKILL.md, README, prompt files).
- Follow prompt-level dependencies (skills invoked from inside this skill; scripts referenced).
- Evaluate against the dimensions listed below.
- Emit one of: **keep** (our stack stays; nothing to adopt), **adapt** (modify our version using external patterns), **adopt** (bring in external component as-is or near-as-is), **drop** (our stack has this but shouldn't), **pilot** (shortlist for pass 2 — read-pass couldn't decide).

### Pass 2: pilot shortlisted components

For each component tagged `pilot` in pass 1:
- Fresh worktree, fresh session, invoke the skill against one sample ralph-shaped task.
- Narrative observation: what did it produce, where did it stumble, does it compose with our Linear/worktree/autonomous-mode assumptions.
- No numerical comparison. No multiple trials. Not a statistical claim — just "does this actually work the way its markdown claims on a task of our shape."
- Resolve to a **keep/adapt/adopt/drop** verdict where possible. If two or more components in the same phase both look credible after pilot and narrative alone can't separate them, flag the unresolved set as candidates for the **numerical pilot follow-up** (see below).

### Numerical pilot follow-up (gated, optional)

**When to trigger.** A set of ≥2 components within the same phase where pass 2 left the ranking unresolved **and** the components differ enough that numerical comparison could plausibly pick a winner. Same-prompt-different-model comparisons don't qualify — cross-model is held fixed per ENG-178's constraints. If no unresolved set surfaces after pass 2, the numerical pilot is skipped and the Execute parent consumes the arm lists directly from this recon.

**What it is, when triggered.** A scaled-down comparative experiment covering the unresolved candidates only. Filed as a separate ticket. Concretely:

- **Task reshaping.** Pick 2 already-Done Agent Config tickets with clear acceptance criteria and multi-file scope, covering both "mostly mechanical" and "some design judgment." Reshape each into a Terminal-Bench-style triple (English instruction + test script + reference solution). The reshaped tickets are reusable infrastructure for later ENG-178 execute-phase runs, not throwaway experiment cost.
- **Per-run logger.** Minimal cost/tokens/wall-clock capture from `claude -p`, strictly a subset of ENG-178's shared-machinery columns. Written so the Execute parent's machinery extends it rather than replaces it.
- **Cell design.** Per unresolved phase: 2 tasks × 2 candidate shapes, 2–3 trials per cell → ~8–12 runs per phase.
- **Execution.** Fresh worktree, fresh `claude -p --permission-mode auto` per trial (same dispatch as `/ralph-start`). Invoke the shape under test; record the log row; score pass/fail by running the reshaped test script against the resulting state.
- **Grading.** Programmatic only. No judges. Components that can't be programmatically graded are not candidates for this pilot — they defer to the full Execute ralph v2 phases.
- **Output.** Pilot-results table appended to the recon doc (`arm, task, trial, resolved, tokens, cost, seconds`), narrative distinguishing conclusive vs. inconclusive per phase, arm-list refinements updated.
- **Envelope.** ~$100–300 API spend, 1–2 days parallel wall clock, ~1 week end-to-end with setup and write-up.

## Evaluation dimensions

Per component, the recon doc records:

- **Purpose.** One-liner tracing upstream rationale. Why does this component exist in its source?
- **Fit for ralph v2.** Does it compose cleanly with:
  - Linear-native state transitions (approved → in progress → in review → done).
  - Worktree-per-issue isolation.
  - Autonomous-mode escape-hatch semantics (exit-clean on architectural deviation, scope deviation, etc.).
  - Programmatic grading (produces an artifact the next phase can consume without human intervention).
  - Upstream CLAUDE.md rules (TDD, root-cause debugging, no backwards-compat without approval).
- **Integration cost.** Dependencies on other skills, scripts, or tools we don't currently have. Prompt-level coupling to things outside the skill's own file.
- **Prompt-quality signal.** Read-level assessment: specificity, hallucination-resistance, testability of invariants it asserts.
- **Recommendation.** keep / adapt / adopt / drop / pilot.
- **Justification.** 1–3 sentences.

## Output

- **Single recon doc** at `agent-config/docs/recon/2026-04-23-harness-component-reconnaissance.md`, structured by phase:
  - Phase 1: idea → PRD (components: our `ralph-spec`, our `brainstorming` override, upstream `obra/superpowers` brainstorming, frankbria equivalents, addyosmani equivalents, alirezarezvani equivalents, mattpocock `/grill-me` and neighbors).
  - Phase 2: PRD → plan (components: our `writing-plans` override, upstream `writing-plans`, PRD-only-no-plan as a degenerate baseline, external equivalents).
  - Phase 3: plan → code (components: our `ralph-implement`, our `subagent-driven-development` override, upstream `executing-plans`, upstream SDD, external equivalents).
  - Each phase ends with a summary: winner-for-ENG-178-arm-list / shortlist-for-numerical-pilot / not-competitive.
- **Cross-cutting findings** section for patterns observed across phases (e.g., "all external Phase-3 shapes skip per-task review," "our override of X is now redundant with upstream Y").
- **Recommended arm lists** for the Execute ralph v2 evaluation parent ticket, ready to drop into its scope.
- **ADRs in `agent-config/docs/decisions/`** for any recommendation that actually changes our stack — adopt a new external skill, drop one of ours, rewrite an override. The recon doc references each ADR; the ADR carries the durable rationale.

## Ticket structure

- **This recon ticket.** Covers pass 1 + pass 2 + recon doc + any triggered ADRs. Blocks the Execute parent.
- **New Execute ralph v2 workflow evaluation parent ticket.** Administrative cleanup for ENG-178 having been closed on "design shipped" rather than "evaluation run." Children: shared evaluation machinery, Phase 1, Phase 2, Phase 3. Arm lists seeded from the recon.
- **Optional numerical-pilot follow-up ticket.** Filed only if an unresolved candidate set surfaces during pass 2. Scoped to those candidates only; runs the minimal machinery described in the Numerical pilot follow-up section above.

ENG-178 stays Done. No reopening.

## Out of scope

- Auxiliary skills (`prepare-for-review`, `close-feature-branch`, `codex-review-gate`, `clean-branch-history`) — unless surfaced as a recon finding.
- Full ENG-178 phase execution — lives in the Execute parent.
- Numerical comparison of components — lives in the optional numerical-pilot follow-up ticket (see Method).
- Cross-model comparison — held fixed at the current ralph default, per ENG-178's shared infrastructure constraints.
- New custom workflow shapes we invent ourselves — the recon audits existing components, it doesn't design new ones.

## Open questions

1. **Sample-task selection for pass 2 pilots.** Default: an already-Done Agent Config ticket with clear acceptance criteria, multi-file scope, moderate design judgment. Decide at the start of pass 2 after the shortlist is known, since some shortlisted components may constrain the task shape (e.g., a PRD-writer pilot needs a ticket whose current PRD has gaps worth re-authoring).
2. **Adoptable-but-unused upstream components.** If pass 1 finds an `obra/superpowers` skill we don't currently use but should, file an ADR to adopt immediately — don't wait for the Execute phases. Default: ADR to adopt if the recommendation is clear; flag as pilot if it's "maybe."
3. **When pass 1 reveals that an override is redundant with current upstream.** Recommendation track: **drop**, with an ADR. Dropping an override is a real change (the symlink-and-patches plumbing in `superpowers-patches.md` needs updating); treat as one ADR per drop.
4. **Handling sparse or low-quality external repos.** If a source repo doesn't actually contain per-step components (e.g., it's a skill collection that doesn't touch the ralph pipeline), or components are consistently below our prompt-quality bar, terminate that source's audit early and record "surveyed, nothing relevant" in the recon doc rather than forcing full per-component entries.
