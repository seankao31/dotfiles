# Ralph v2 Workflow Evaluation Design

**Date:** 2026-04-22
**Linear issue:** ENG-178 (rescoped from "Issue-to-spec brainstorming alternatives" to cover the full three-phase pipeline)
**Subsumes:** ENG-177 (spec-to-plan experiments), ENG-218 (plan-to-code experiments) — both canceled
**Relates to:** ENG-184 (orchestrator), ENG-206 (ralph-implement skill)

## Problem

Ralph v2 shipped with workflow defaults chosen by design intuition, not measurement. Three pipeline stages need empirical evaluation to pick the right shape for each:

| Stage | Question |
|---|---|
| 1: idea → PRD | What shape of brainstorming produces a PRD that `/ralph-implement` can autonomously execute? |
| 2: PRD → plan | Given a sufficient PRD, is a separate `/writing-plans` phase needed, or is the PRD alone enough? |
| 3: plan → code | Which implementation shape (single-session vs. controller-with-subagents, with or without per-task review) produces the best quality/cost tradeoff? |

Running these as three separate experiments fragments the shared evaluation machinery (task selection, programmatic grading, cost tracking, reference methodology) across three tickets. This doc consolidates into one investigation with three sequential phases that share the same foundation.

## Prior art — reference methodology

Extensive prior work exists on evaluating LLM code generation and agentic coding workflows. We borrow measurement technique, not conclusions. The list below is curated from a web research pass (2026-04-21); details of tradeoffs and pitfalls live in the cited sources.

### Measurement patterns to adopt

- **Aider leaderboard row format** — per-run tabulation of `resolved`, `pass@1`, `pass@2`, cost, tokens, seconds. Copy verbatim; substitute "workflow arm" for "model." https://aider.chat/docs/leaderboards/
- **METR time-horizon framing** — fit logistic of success rate vs. human task duration to produce interpretable conclusions like "arm X reliably handles tasks up to N hours of human-expert time." https://metr.org/blog/2025-03-19-measuring-ai-ability-to-complete-long-tasks/
- **Terminal-Bench programmatic grading** — each task is English instruction + test script + reference solution. No LLM-as-judge; pass/fail is execution-verified. The cleanest grading shape for coding tasks. https://www.tbench.ai/
- **CodeContests `n@k` metric** (DeepMind AlphaCode, 2022) — generate k candidates, pick n that pass. Directly models "does a review stage filter correctly," which is Phase 3's core question.
- **LLM-as-judge mitigations** — position-swap, length-control regression, ensemble across model families, require chain-of-thought rationale. Only relevant for axes where execution-based grading isn't possible.

### Meta-harness parallels

Stanford IRIS Lab's meta-harness (arXiv:2603.28052) automatically searches over harness code — what this evaluation does manually across a fixed set of arms. Three observations worth carrying:

1. Their converged TB 2.0 harness is public: https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact — read before finalizing Phase 3 arms. If their search landed on a shape we haven't listed, it becomes a candidate arm F without having to run their framework.
2. Published 76.4% on Opus 4.6 (TB 2.0) — mid-pack vs. ForgeCode (79.8%), Capy (75.3%), Droid (69.9%). Harness design produces ~10-point spreads on the same model. Empirical evidence that the signal this evaluation is chasing exists at public-benchmark scale.
3. Their methodology insight — **full execution traces as input to the review step, not compressed summaries** — applies to our per-arm review setup regardless of whether we adopt their framework.

### Contamination caveats

- **SWE-bench contamination is large** (arXiv:2506.12286, "The SWE-bench Illusion"). Models reproduce human patches verbatim from training. If using SWE-bench tasks, restrict to Verified and/or post-training-cutoff issues.
- **~60% of remaining SWE-bench Verified failures are benchmark artifacts** (over-narrow or over-wide tests). Caps achievable resolved-rate in ways unrelated to workflow quality.
- Our own Agent Config tickets post-cutoff are the cleanest signal for our use case. External benchmarks provide comparability at the cost of representativeness.

## Task selection

Two options, both valid, pick at the start of Phase 1:

### Option A: Own Linear tickets only

3–5 already-Done Agent Config tickets with:
- clear acceptance criteria in the PRD,
- multi-file scope (single-file tasks don't stress decomposition),
- a mix of "mostly mechanical" and "some design judgment."

Reshape each into Terminal-Bench-style (English instruction + test script + reference solution) before running. The reshaping is reusable infrastructure for future ralph work, not throwaway experiment cost.

- **Pro:** perfectly matches target workload; forces PRD quality improvements as a side effect.
- **Con:** smaller sample, not externally comparable to published numbers.

### Option B: Own tickets + Terminal-Bench 2.0 subset

As Option A, plus a subset of TB 2.0 tasks (~20 representative).

- **Pro:** larger sample, externally comparable to published leaderboard, existing programmatic-grading infrastructure via `harbor run`.
- **Con:** TB tasks are terminal-focused; less representative of chezmoi / agent-config work. Harbor adapter needs to be written for each arm.

### Recommendation

Option A first. Faster path to a decision; reshaping our own tickets into TB-style triples is valuable infrastructure independent of the experiment outcome. Option B if internal-only results are ambiguous or if external comparability matters for publication.

## Shared infrastructure constraints

Apply to all phases:

- **Hold model fixed** across arms within a phase. Cross-model comparison is out of scope.
- **Hold seed, task order, initial worktree state fixed.** Agentic runs are high-variance. Report pass@k, not just pass@1, with mean + confidence intervals across seeds.
- **Token budget not equalized** — some arms deliberately use more turns than others — but always logged. Pareto-plot quality vs. cost across arms; never report one without the other.
- **Programmatic grading when possible.** Judge grading only for axes that truly require it (e.g., subjective code-quality rating). Apply the LLM-as-judge mitigation stack when judging is unavoidable.
- **Per-run log:** `resolved {0,1}`, `rework_rounds`, `spec_deviations (count × severity)`, `findings_at_terminal_review (count × severity)`, `total_invocations`, `total_tokens`, `total_cost_usd`, `wall_clock_seconds`, `early_catches` (issues caught mid-flight that terminal would have missed), `oscillations` (review-fix-review cycles that didn't converge cleanly).

## Phase 1: idea → PRD

### Arms

- `/brainstorming` (superpowers baseline)
- Claude native plan mode (lighter design exploration)
- GSD (Get Shit Done) style
- `/grill-me` (mattpocock/skills) — adversarial questioning
- Hand-written PRD (no skill scaffolding)

### Scoring

A PRD's quality is measured indirectly: **does `/ralph-implement` succeed on it without human intervention?** The Phase 1 arm that produces PRDs with the highest downstream ralph-implement success rate wins. This requires Phase 3's infrastructure for execution; run Phase 1 as a dry-run against a reference Phase 3 arm (e.g., arm A, baseline `/ralph-implement`) and score by downstream resolve rate.

### Hypothesis

PRD quality (measured by downstream ralph-implement success) is what matters, not the process that produced it. Any brainstorming shape that reaches sufficient detail is sufficient; beyond that, wall-clock-to-Approved is the dominant differentiator.

### Deliverable

A chosen default for Stage 1; a documented quality bar for "ralph-ready PRD" (concrete criteria, not vibes).

## Phase 2: PRD → plan

### Arms

- `/writing-plans` (superpowers baseline — current interactive behavior)
- PRD-only (no plan — ralph-implement's current default)
- PRD + short outline (approach paragraphs, not bite-sized tasks)
- Community variants (mattpocock/skills, snarktank/ralph)

### Hypothesis

Opus 4.7 can implement from a well-written PRD without a separate plan phase, provided the PRD meets the Phase 1 quality bar. Plans add cost without clear quality gain above that bar. Below the bar, plans compensate for PRD underspecification — but the right fix is the PRD, not the plan.

### Deliverable

Decision on whether `/writing-plans` (or an analogue) remains in the ralph pipeline. If kept, documented criteria for when to invoke it.

## Phase 3: plan → code

### Arms

Hold input shape fixed per Phase 2's outcome. Vary execution:

| Arm | Decomposition | Fresh-subagent-per-task | Per-task review | Terminal review |
|---|---|---|---|---|
| A: `/ralph-implement` (baseline) | none | no | none | codex |
| B: single session + per-checkpoint codex | none | no | codex | codex |
| C: SDD minus Claude reviewers | yes | yes | codex only | codex |
| D: `/subagent-driven-development` (as-is) | yes | yes | spec + quality + codex | codex + final code review |
| E: SDD decomposition, single-session execution | yes (plan-as-todo) | no | codex only | codex |

A and D are the current extremes; B/C/E isolate individual dimensions.

**Candidate Arm F:** meta-harness's converged TB 2.0 harness, if reading their artifact reveals a shape not covered by A–E. Decide before Phase 3 kicks off.

**Critical comparison: C vs D** — tests whether the two same-model reviewers in SDD (spec-compliance, code-quality) are marginal once per-task codex is in place. If C ≈ D in quality at ~half the cost, the design conclusion is "keep decomposition + fresh subagents + per-task codex, drop same-model reviewers."

### Hypotheses

- **H1:** Terminal codex review catches most critical issues regardless of arm; per-task reviews mainly catch issues that compound across tasks.
- **H2:** The two same-model reviewers in SDD are marginal relative to per-task codex. Arm C ≈ arm D in quality at roughly half the cost.
- **H3:** Decomposition matters more than per-task review — arms C/D/E beat A/B by more than C beats D.

Falsifying or confirming each narrows the adoption decision.

### Deliverable

Chosen default execution shape for `/ralph-implement`; documented escape hatch (per-PRD or per-ticket) for opting into other shapes when the default isn't right.

## Sequencing

Run phases in order. Later phases' inputs are fixed by earlier phases' outcomes. Running in reverse (or in parallel) would confound input shape with output shape.

Before Phase 1 kicks off, build the shared evaluation machinery: task list, programmatic grading scripts, cost/token/time logging, per-run tabulation format. This dominates the up-front cost; each phase then consumes the same machinery with minor extensions.

## Out of scope

- **Picking a "winning arm" to mandate across all work.** Deliverable is a default + per-ticket opt-outs, not a mandate.
- **Cross-model comparison.** Hold the model fixed per phase. Model choice is a separate axis.
- **Changing `/ralph-implement` or SDD mid-experiment.** Adoption of findings is a follow-up ticket.
- **Brand-new workflow shapes not listed above.** Interesting candidates surfaced mid-experiment become follow-ups, not scope expansion.
- **Adopting the meta-harness framework.** Read their converged artifact as a reference point; don't rebuild their infrastructure unless a clear reason emerges.
- **Evaluating non-coding tasks.** This is specifically about ralph's coding workflow. Text-classification or math-reasoning benchmarks (meta-harness covers these) are out of scope.

## Deliverables

- **This file:** the design (immediate).
- **Shared evaluation machinery:** scripts + fixtures, created at the start of Phase 1, committed incrementally.
- **Per-phase recommendation docs** at `agent-config/docs/experiments/YYYY-MM-DD-phase-N-<name>.md`.
- **Consolidated final recommendation** at `agent-config/docs/experiments/YYYY-MM-DD-ralph-v2-workflow-evaluation.md`, synthesizing the three phase outcomes into adoption decisions.

## Open questions

1. **Option A vs Option B task selection** — decide at the start of Phase 1 after reshaping two candidate tickets into TB-style and seeing what the effort looks like.
2. **Whether to include automated harness search (meta-harness-style) as a sixth Phase 3 arm F** — decide after reading their TB 2.0 artifact. Read is a 30-minute task; it should inform the arms list before Phase 3 begins.
3. **Number of runs per (arm, task) for statistical power** — decide after a pilot run on a single ticket. Default assumption: 3–5 seeds per pair; revise based on observed variance.
4. **Whether to run Option B's TB 2.0 subset even if Option A is conclusive** — external comparability may be worth the adapter-writing cost if this investigation produces a publishable recommendation, but that's a later call.
