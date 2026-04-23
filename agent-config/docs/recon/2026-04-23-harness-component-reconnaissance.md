**Date:** 2026-04-23
**Linear issue:** ENG-246 (recon of harness components for ralph v2 pipeline stages)
**Relates to:** ENG-178 (ralph v2 workflow evaluation — arm lists refined by this recon)
**Status:** Pass 1 (read-level audit) complete. Pass 2 (pilot) deferred to follow-up ticket.

## Scope note

Per PRD, ENG-246 originally planned to cover Pass 1 + Pass 2 + recon doc + any triggered ADRs in one ticket. In practice, Pass 2 is explicitly "fresh worktree, fresh session per shortlisted component" — architecturally incompatible with a single autonomous ralph session. This recon ticket shipped Pass 1 + the recon doc + shortlist + ADRs; Pass 2 is filed as a follow-up. See the Ticket Structure section at the bottom.

## Method actually executed

Two-pass plan; Pass 1 only in this ticket. For each in-scope component (four layers: our in-repo skills, our superpowers overrides, upstream `obra/superpowers` non-overridden pipeline components, external repos) we recorded purpose, fit against the five dimensions below, integration cost, prompt-quality signal, and a recommendation verdict.

Dimensions:
1. **Linear-native state transitions** (approved → in progress → in review → done)
2. **Worktree-per-issue isolation**
3. **Autonomous-mode escape-hatch semantics** (exit clean with a Linear comment; no retry loops)
4. **Programmatic-grading handoff** (produces an artifact the next phase can consume without human intervention)
5. **Upstream CLAUDE.md rules** (TDD, root-cause debugging, no backcompat without approval)

Verdicts: **keep** / **adapt** / **adopt** / **drop** / **pilot**.

## Correction re: override vs upstream comparison

An initial read concluded our `superpowers-overrides/*/SKILL.md` files were byte-identical to "upstream" and therefore redundant. This was a **symlink artifact**: the plugin cache at `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/<name>/SKILL.md` is symlinked TO `agent-config/superpowers-overrides/<name>/SKILL.md`, so diffing them returns empty.

The authoritative comparison is against `obra/superpowers` at tag `v5.0.7` fetched from GitHub. Against actual upstream, diff sizes are:

| Override | Diff lines vs v5.0.7 upstream |
|----------|-------------------------------|
| `brainstorming` | 22 |
| `writing-plans` | 42 |
| `subagent-driven-development` | 101 |
| `using-superpowers` | 7 |
| `finishing-a-development-branch` | 93 |

All overrides remain load-bearing. The patches documented in `agent-config/docs/playbooks/superpowers-patches.md` are faithfully applied.

---

# Phase 1: idea → PRD

## Our in-repo `ralph-spec` (Phase 1 entry point)

- **Purpose.** Transform a raw idea into an Approved Linear issue (PRD) with `docs/specs/<topic>.md` and blocker relations, ready for autonomous dispatch by `ralph-start`.
- **Fit for ralph v2.**
  - Linear transitions: **yes.** Full state-machine driver (Todo/Backlog → Approved), config-driven state names.
  - Worktree isolation: **no** — interactive skill in the main checkout; spec authoring doesn't need a worktree. Not a fit issue; it's by design.
  - Autonomous-mode escape-hatch: **n/a** — explicitly scoped interactive-only with a HARD-GATE "do NOT invoke any implementation skill."
  - Programmatic-grading handoff: **yes.** Produces `docs/specs/<topic>.md` + Linear description; both are the spec contract ralph-implement consumes.
  - CLAUDE.md rules: **partial.** Enforces scope clarity + autonomous-readiness. TDD/debugging rules N/A (spec phase).
- **Integration cost.** Hard deps on `ralph-start` libs (config/Linear), `linear-workflow`, jq, Linear CLI. Optional superpowers brainstorming visual companion.
- **Prompt-quality signal.** High — prescriptive 10-step checklist, spec self-review gates (placeholder/contradiction/scope/ambiguity), prerequisite surfacing + blocker verification via PREREQS vs actual cross-check. Intrinsically hallucination-resistant.
- **Recommendation:** **keep.**
- **Justification.** Core Phase 1 component. Strong state machine, prescriptive gating, HARD-GATE prevents implementation leak-through. No blockers to evaluation.

## Our `brainstorming` override

- **Fit:** same upstream design discipline + linear-workflow insertion (step 9) threading design→issue→plan for ralph v2's Linear-driven flow.
- **Integration cost:** depends on `linear-workflow`; invokes `writing-plans` at terminal.
- **Prompt-quality:** inherits upstream rigor (anti-patterns, validation gates, visual companion).
- **Recommendation:** **keep.** Override vs upstream: **still-load-bearing** (22-line diff against v5.0.7 upstream inserts the `linear-workflow` step and process-flow node that upstream lacks).

## Upstream `brainstorming` (as baseline)

- Identical design discipline without Linear integration. Pipeline would lose the Phase 1 → Linear anchor.
- **Recommendation:** **drop-as-arm** (not competitive as Phase 1 arm against our override; baseline only).

## External: `mattpocock/skills` — `/grill-me`

- **Core technique.** Depth-first one-question-at-a-time walk of the design decision tree, with the agent offering a recommended answer per question, plus an explicit off-ramp: *if the question can be answered by exploring the codebase, explore instead.* The codebase-check-first clause is the distinctive bit.
- **Fit:** every dimension **no/none** as raw skill (pure dialogue, no Linear/worktree/escape-hatch/handoff). It's a prompt, not a harness.
- **Integration cost:** 635-byte prompt — trivial to lift. To function as a Phase 1 arm, wrap it inside the existing `ralph-spec` plumbing (Linear fetch, spec MD write, Approved transition, blocked-by). ~80% of that plumbing is ours already.
- **Prompt-quality:** high on shape, low on stop-condition rigor ("shared understanding" is subjective).
- **Recommendation:** **pilot.** Genuinely distinct shape from our brainstorming override (depth-first single-branch with recommended answer + codebase-check-first) vs our breadth-first divergent brainstorming. Worth measuring against our baseline in ENG-178 Phase 1.
- **Justification.** Low pilot cost — swap the brainstorming prompt inside `ralph-spec` wrapper; all pipeline plumbing stays ours. Do NOT adopt as-is; it lacks every pipeline dimension.

## External: `mattpocock/skills` — `to-prd` (Phase 1→2 straddler, included here)

- PRD template: Problem / Solution / User Stories / Implementation Decisions / Testing Decisions / Out of Scope. "No file paths / no code snippets, they go stale" rule.
- **Recommendation:** **adapt** — cherry-pick the explicit Testing Decisions section + "deep modules" framing into `ralph-spec`'s template if not already present. Not a pilot candidate; too close to what we have.

## External: `addyosmani/agent-skills` — `idea-refine`

- Five named divergence lenses (Inversion / Audience-shift / 10x / Simplification / Expert-lens) + "what could kill this idea?" convergence.
- Blocks on `AskUserQuestion`; incompatible with `claude -p` autonomous sessions.
- **Recommendation:** **drop** (at component level), **adapt prompts** — lift the five named lenses and the "what could kill this idea / what we're choosing to ignore" convergence check into our brainstorming override.

## External: `addyosmani/agent-skills` — `spec-driven-development`

- "ASSUMPTIONS I'M MAKING → correct me now" ritual, three-tier Boundaries scaffold (Always / Ask-first / Never), 4-gate human-review flow.
- **Recommendation:** **drop** — 4-gate human-review flow breaks autonomous mode. **Adapt prompts** — lift the assumptions-first opening ritual into `ralph-spec`.

## External: `alirezarezvani/claude-skills` — `product-discovery`

- Teresa Torres Opportunity Solution Tree + assumption-mapping. Sits upstream of our pipeline (problem is already decided by the time `ralph-spec` is invoked).
- **Recommendation:** **drop.** Our entry point is later in the funnel.

## External: `frankbria/ralph-claude-code`

- No per-step components. Single-prompt loop runner with empty `specs/` + `templates/specs/`. `SPECIFICATION_WORKSHOP.md` is a human Three Amigos facilitator guide, not an agent-invokable shape.
- **Recommendation:** **drop.** Anti-aligned with our CLAUDE.md ("PRIORITIZE: Implementation > Documentation > Tests"; "LIMIT testing to ~20% of effort"). Nothing relevant.

## External: `snarktank/ralph` — `prd` skill

- Interactive PRD authoring via 3–5 lettered clarifying questions, writes `tasks/prd-[feature].md`.
- Strictly less capable than our `ralph-spec` (no Linear, no Approved transition, no blocked-by).
- **Recommendation:** **drop.** Lettered-options Q&A pattern is tactical at best, not worth integrating.

## Phase 1 summary

- **Winner for ENG-178 Phase 1 default arm:** our `brainstorming` override, threaded through `ralph-spec`. Only Phase-1 shape with Linear/autonomous-ready plumbing.
- **Pilot arm for Phase 1 comparison (ENG-178):** `/grill-me` wrapped in the `ralph-spec` harness. Distinct depth-first+codebase-check-first shape; swap cost is one prompt file.
- **Cherry-pick into `ralph-spec`/brainstorming (no pilot required, stack-changing but low risk):**
  - `idea-refine`'s five named divergence lenses
  - `spec-driven-development`'s assumptions-first opening ritual
  - `idea-refine`'s "what could kill this idea?" convergence check
  - `to-prd`'s explicit Testing Decisions section (if not already in our template)
- **Not competitive:** `frankbria/ralph-claude-code` (loop runner, anti-aligned), `snarktank/ralph`'s `prd` (strictly weaker than ours), `addyosmani` skills as components (interactive-only), `product-discovery` (wrong point in funnel).

---

# Phase 2: PRD → plan

## Our `writing-plans` override

- **Fit:** upstream plan rigor (bite-sized tasks, exact file paths, TDD, no placeholders) + patches that force the fresh-session SDD+codex handoff and remove the executing-plans alternative.
- **Recommendation:** **keep.** Override vs upstream: **still-load-bearing** (42-line diff removes the two-option executing-plans branch and mandates fresh-session subagent-driven execution with codex gates).

## Upstream `writing-plans`

- Offers two-option execution handoff (subagent-driven OR executing-plans). Mentions two-stage review, not three-stage-with-codex.
- **Recommendation:** **drop-as-arm** — our override closes the door on the executing-plans alternative, which is deliberate.

## Upstream `executing-plans` (candidate Phase 3 arm, discussed here for context)

- Same-session batch execution with review checkpoints. Calls `using-git-worktrees` on entry, `finishing-a-development-branch` on exit.
- **For Phase 2:** n/a (this is a plan *executor*, not a plan *writer*).
- **For Phase 3:** see the Phase 3 section below; it is ENG-178 Phase 3 Arm A's natural alternative to SDD-style fresh-subagent-per-task execution.

## PRD-only baseline (no plan step)

- Skip `writing-plans`; feed the PRD directly to Phase 3.
- **Fit:** trivially Linear-native (no plan skill to coordinate). Worktree/escape-hatch/handoff dimensions all pass through the Phase 3 executor.
- **Integration cost:** zero new skills; removes a step.
- **Recommendation:** **pilot** (this is ENG-178 Phase 2 Arm B — the live question ENG-178 wants answered).
- **Justification.** Opus 4.7 may be able to implement from a well-written PRD without a separate plan. Measuring this is exactly the Phase 2 experiment.

## External: `addyosmani/agent-skills` — `planning-and-task-breakdown`

- Dependency-graph + vertical-slice decomposition with verification commands + per-2-3-task checkpoints.
- **Recommendation:** **drop.** Duplicates `writing-plans`; no unique mechanism.

## External: `alirezarezvani/claude-skills` — `spec-driven-workflow`

- RFC-2119-formatted requirements, Given/When/Then ACs, a `spec_validator.py --strict` score gate, bounded-autonomy escalation template with STOP conditions.
- **Fit:** Strong on **programmatic grading** — `spec_validator.py` + `test_extractor.py` give machine-checkable handoff spec → tests → code, exactly the shape our pipeline lacks. Strong on **escape hatch** — the escalation-with-recommendation template parallels our autonomous-exit-with-Linear-comment pattern.
- **Recommendation:** **adapt.** Lift two patterns: (a) a validator-script gate at Phase 1→2 boundary that programmatically checks spec completeness before ralph-implement dispatches; (b) the escalation-with-explicit-recommendation template for autonomous-mode exit comments. Don't adopt the whole skill — it conflates phases we keep separate.

## External: `snarktank/ralph` — `ralph` skill (JSON plan with pass flags)

- Converts markdown PRD to `prd.json` schema with `{project, branchName, userStories[]}`, each with `passes: false/true`.
- **Interesting design idea:** "plan = machine-checkable list with per-item pass/fail state." Maps cleanly to Linear sub-issues with state transitions.
- **Recommendation:** **adapt (idea only, not code).** Capture as an alternative Phase 2 output shape in design notes; evaluate against free-form plan.md when Phase 2 runs its own shape experiment. Not a pilot arm for ENG-178 Phase 2 (the arms there are plan-skill shape, not output-format shape).

## External: `mattpocock/skills` — `to-issues`

- PRD → tracer-bullet vertical-slice issues with **HITL vs AFK tagging** + blocked-by chains.
- **Novel primitive we don't have:** HITL/AFK tag is a principled triage for what `/ralph-start` can safely pick up in autonomous mode.
- **Recommendation:** **adapt.** Add HITL/AFK label (or equivalent field) to our Linear taxonomy; teach `ralph-start` to prefer AFK issues. Filed as its own ADR below.

## Phase 2 summary

- **Winner for ENG-178 Phase 2 default arm:** our `writing-plans` override (current default).
- **Pilot arm for Phase 2 comparison (ENG-178):** PRD-only baseline. The live question is whether a separate plan phase adds value above the Phase-1 quality bar.
- **Stack-changing recommendation (ADR candidate):** Adopt HITL/AFK tag from `mattpocock/skills` into Linear workflow.
- **Design-note recommendation (no ADR yet):** Capture `snarktank/ralph`'s JSON-plan-with-pass-flags as alternative Phase 2 output shape; decide during Phase 2 execution.
- **Validator-gate recommendation:** Adapt `spec_validator.py`-style programmatic completeness check for the Phase 1→2 handoff. Worth a pilot.
- **Not competitive:** `planning-and-task-breakdown` (duplicates upstream), `snarktank/ralph`'s `prd` skill (Phase 1 tooling; evaluated under Phase 1).

---

# Phase 3: plan → code

## Our in-repo `ralph-implement`

- **Fit:**
  - Linear: **partial** — issue pre-transitioned to In Progress by orchestrator; delegates Review transition to `/prepare-for-review`.
  - Worktree: **yes** — expects pre-created worktree + `.ralph-base-sha`.
  - Escape-hatch: **yes** — explicit red flag list (missing ISSUE_ID, malformed PRD, merge conflicts, test failures, unreachable Linear CLI); declines to invoke `/prepare-for-review` on failure to signal `exit_clean_no_review`.
  - Handoff: **partial** — conditional `/prepare-for-review` invocation; downstream skill actually produces the Linear In-Review transition and comment.
  - CLAUDE.md: **yes** — mandates `test-driven-development` + `systematic-debugging`, smallest reasonable changes.
- **Prompt-quality:** moderate. Strong red-flag list + conditional gates. Implementation section is thin — delegates to external skills (TDD, debugging) without repeating critical verifications. No explicit scope-recheck after implementation; no artifact-shape checklist for handoff.
- **Gap found during audit:** does not reference upstream `superpowers:verification-before-completion`, which is the natural source of "no success claim without fresh verification" discipline at Step 4. Adopt-immediately candidate per PRD open question #2.
- **Recommendation:** **adapt.** Structurally sound; tighten Step 3 (scope adherence) and Step 4 (invoke `verification-before-completion`).

## Our `subagent-driven-development` override

- **Fit:** fresh-subagent-per-task with three-stage review (spec, quality, codex) per task + final codex. Terminates at `finishing-a-development-branch` → Linear Done. Autonomous-safety block "If final codex review finds issues: STOP, present findings, ask user" prevents blind auto-fixes.
- **Recommendation:** **keep.** Override vs upstream: **still-load-bearing** (101-line diff adds per-task codex gate + final-findings handling).
- Autonomous-safety of the codex-findings block depends on caller-side policy added after ENG-220 made `codex-review-gate` caller-agnostic.

## Upstream `subagent-driven-development`

- Same decomposition but no per-task codex and no terminal-findings handling.
- **Recommendation:** **drop-as-arm** unless pilot proves the codex tier is marginal. Relevant arm for ENG-178 Phase 3 is Arm C (SDD minus Claude reviewers), not upstream SDD.

## Upstream `executing-plans`

- Same-session batch execution; uses `using-git-worktrees` on entry, `finishing-a-development-branch` on exit. Strong "raise concerns first" gate and explicit red-flag stopping.
- **Fit:** Linear-native partial (requires human-approval checkpoint between phases); worktree yes; escape-hatch yes; handoff partial; CLAUDE.md yes.
- **Recommendation:** **adopt-as-arm.** Natural candidate for ENG-178 Phase 3 Arm E (SDD decomposition + single-session execution). Our override's writing-plans deliberately removed this path; the experiment in ENG-178 reopens the question.

## Upstream `dispatching-parallel-agents`

- Dispatch isolated agents per independent problem domain.
- **Fit:** light/partial on most dimensions. Useful as a Phase 3 sub-pattern for test-failure triage, not as a primary arm.
- **Recommendation:** **pilot** for Phase 3 blocker triage, not Phase 3 primary arm.

## Upstream `test-driven-development`, `systematic-debugging`

- Cross-cutting. Already mandated by our CLAUDE.md; referenced by `ralph-implement`.
- **Recommendation:** **keep** (already adopted).

## Upstream `verification-before-completion`

- "No completion claim without fresh verification" — evidence before assertions.
- **Fit:** yes on every dimension except produces-artifact-for-next-phase.
- **Gap:** not currently referenced by our `ralph-implement` or any override. Per PRD open question #2, this is "adoptable-but-unused upstream we should probably use" — the answer is ADR-to-adopt.
- **Recommendation:** **adopt.** Invoke from `ralph-implement` Step 4 ("Verify tests pass") before invoking `/prepare-for-review`. Filed as its own ADR below.

## Upstream `requesting-code-review`, `receiving-code-review`

- Review-dispatch and review-response mindsets. Cross-cutting. `requesting-code-review` is referenced from our SDD override; `receiving-code-review` is unreferenced but behavioral.
- **Recommendation:** **keep.** Not pipeline arms — supporting doctrine.

## External: `frankbria/ralph-claude-code`

- Single-prompt loop runner with no per-step execution shape. `PROMPT.md` says "LIMIT testing to ~20% of effort, only write tests for NEW functionality" — directly contradicts our TDD-first rule.
- **Recommendation:** **drop.** Not competitive, anti-aligned.

## External: `addyosmani/agent-skills` — `incremental-implementation` + `test-driven-development`

- Prose RED/GREEN/REFACTOR + thin-vertical-slice loop. ~90% overlap with `superpowers:test-driven-development`, no unique mechanism.
- **Recommendation:** **drop.**

## External: `alirezarezvani/claude-skills` — `karpathy-coder`

- Pre-commit gate enforcing "surface assumptions / simplicity / surgical changes / goal-driven" via detector scripts (`complexity_checker.py`, `diff_surgeon.py`, `assumption_linter.py`, `goal_verifier.py`). Reviewer sub-agent + `hooks/karpathy-gate.sh`.
- **Fit:** best external match on **upstream CLAUDE.md rules** — "surgical changes / no drive-by refactor" matches our "SMALLEST reasonable changes." Scripts are stdlib Python. No Linear/worktree/escape-hatch.
- **Recommendation:** **pilot** as a non-blocking pre-commit warning in the chezmoi repo. `diff_surgeon.py` heuristic for flagging drive-by changes is directly useful for ralph autonomous sessions that occasionally sprawl. Pilot as warning-only; decide on blocking after a few runs.

## External: `alirezarezvani/claude-skills` — `git-worktree-manager`

- Scripted worktree creation + cleanup with dirty-tree / merged-only safety checks.
- **Recommendation:** **drop.** Overlaps our existing `using-git-worktrees` + `close-branch` skills; ours are Linear-aware and already encode the merge/push invariants.

## External: `mattpocock/skills` — `tdd`

- Same red-green-refactor as upstream `test-driven-development` with one crisp callout: "horizontal slicing anti-pattern."
- **Recommendation:** **adapt.** Cherry-pick the horizontal-slicing anti-pattern callout into our TDD material.

## Phase 3 summary

- **Winner for ENG-178 Phase 3 default arm:** our `ralph-implement` + `subagent-driven-development` override (current default for SDD-shape; `ralph-implement` for single-session-shape).
- **Pilot arms for Phase 3 comparison (ENG-178):**
  - Upstream `executing-plans` as Arm E's natural basis.
  - Upstream SDD (minus our codex-per-task patch) as Arm C's natural basis.
  - Per ENG-178, Arms A/B/D are already named and unchanged.
  - **No Arm F from this recon** — neither the meta-harness artifact (covered separately in ENG-178 OQ #2) nor any external repo surfaced a Phase 3 shape not already covered by Arms A–E.
- **Stack-changing recommendations (ADR candidates):**
  - Adopt `verification-before-completion` into `ralph-implement` Step 4.
  - Pilot `karpathy-coder` detectors as non-blocking pre-commit warnings.
- **Prompt-level cherry-picks:** mattpocock `tdd` horizontal-slicing anti-pattern into upstream TDD material.
- **Not competitive:** `frankbria/ralph-claude-code` (anti-aligned), `addyosmani/agent-skills` Phase 3 prose (duplicates upstream), `git-worktree-manager` (already covered).

---

# Cross-cutting findings

## 1. External repos don't ship pipeline harnesses; they ship prompts

All five external repos produced at most 2–4 pipeline-shaped per-step components. None ship Linear-native state transitions, worktree-per-issue isolation, autonomous-mode escape hatches, or programmatic-grading handoffs as a system. Where external repos have distinct value, it's at the **prompt level** (shapes, templates, named techniques) — not at the harness level.

**Implication.** Our pipeline-plumbing layer is the differentiating investment. The external repo survey confirms there's no off-the-shelf harness to adopt wholesale — we build the pipeline, we can selectively import prompts.

## 2. Our overrides vs upstream — all five still earn their place

All five overrides have meaningful, intent-matching diffs against actual `obra/superpowers` v5.0.7 (verified by GitHub fetch, not plugin-cache read). The earlier "identical" finding was a symlink artifact worth correcting in the recon narrative.

**Implication.** No override-drop ADRs triggered from this Pass 1. The patches doc's characterization is accurate.

## 3. There is one clear adopt-immediately upstream gap

`superpowers:verification-before-completion` is an existing upstream skill enforcing "no success claim without fresh verification" that we do not reference anywhere in our ralph pipeline skills. This is exactly the shape of finding PRD open question #2 contemplates. Filed as ADR, separate from any Pass 2 work.

## 4. Novel primitives worth adopting from external repos (ADR-track)

Two primitives emerged from external surveys that our stack genuinely lacks and that should not wait for the ENG-178 Execute phase:

- **HITL / AFK issue tagging** (from `mattpocock/skills` `to-issues`). Labels tickets by whether they need a human in the loop. Maps cleanly to a Linear label; `ralph-start` can prefer AFK-tagged issues. Filed as ADR.
- **Spec-completeness validator script** (from `alirezarezvani/claude-skills` `spec-driven-workflow`'s `spec_validator.py`). A programmatic completeness check at the Phase 1→2 handoff would sharpen the "ralph-ready PRD" quality bar ENG-178 wants to define. Worth piloting before ADR — filed as Pass 2 candidate.

## 5. Phase-1 prompt-level adoptions (non-ADR, low risk)

These are prompt-text-only additions to existing skills and are low-risk enough that a single combined update doesn't warrant an ADR per item:

- Named divergence lenses (Inversion / Audience-shift / 10x / Simplification / Expert-lens) from `addyosmani/agent-skills idea-refine`.
- "ASSUMPTIONS I'M MAKING → correct me now" opening ritual from `addyosmani/agent-skills spec-driven-development`.
- "What could kill this idea / what we're choosing to ignore" convergence check from `idea-refine`.
- Horizontal-slicing TDD anti-pattern callout from `mattpocock/skills tdd`.
- Explicit Testing Decisions section in PRD template (from `mattpocock/skills to-prd`) if not already present.

Bundled as a follow-up ticket, not per-item ADRs.

## 6. Pass 2 ranking pressure is lower than expected

Only one Phase 1 shortlist (our brainstorming vs `/grill-me`) and one Phase 3 cross-model review tier dispute (our SDD with per-task codex vs upstream SDD without) emerged as genuinely needing pilot to separate. Phase 2 arms are testable structurally (plan vs no-plan) without pilot, so the pilot scope is smaller than the original PRD anticipated.

**Implication.** The optional numerical-pilot follow-up (from the PRD's Method section) is unlikely to trigger — pass 2 narrative observation should resolve both disputes.

---

# Recommended arm lists for ENG-178 Execute parent

## Phase 1: idea → PRD

- **Arm A (default):** `ralph-spec` + our `brainstorming` override.
- **Arm B (pilot):** `ralph-spec` + `/grill-me`-shaped brainstorming prompt.
- *(Dropped from ENG-178's original list:)* Claude native plan mode, GSD-style, hand-written PRD — these are either not-a-harness-shape or already covered by default arm; ENG-178 Phase 1 compares brainstorming shapes, and we have two distinct ones.

## Phase 2: PRD → plan

- **Arm A (default):** our `writing-plans` override.
- **Arm B (pilot):** PRD-only (skip `writing-plans` entirely — feed PRD directly to Phase 3).
- **Arm C (optional, gated on Phase-1 outcome):** PRD + short approach-paragraph outline.
- *(Dropped:)* "community variants (mattpocock, snarktank)" — mattpocock's `to-issues` surfaces a HITL/AFK primitive handled separately as an ADR, not an arm; snarktank's `ralph` is a different-output-shape design question, not a plan-skill arm.

## Phase 3: plan → code

- **Arm A (default/baseline):** our `ralph-implement`.
- **Arm B:** single-session + per-checkpoint codex.
- **Arm C:** SDD minus Claude reviewers (codex only per task).
- **Arm D:** our full SDD override (three-stage review + final codex).
- **Arm E:** SDD decomposition + single-session execution (uses upstream `executing-plans` as the executor).
- *(No Arm F added by this recon.)* Meta-harness artifact review remains an ENG-178 open question.

---

# ADRs triggered

Three ADRs are filed alongside this recon (same commit). They capture recommendations that change our stack immediately, per PRD open question #2 ("ADR to adopt if the recommendation is clear").

1. `2026-04-23-adopt-verification-before-completion-in-ralph-implement.md` — invoke `superpowers:verification-before-completion` from `ralph-implement` Step 4.
2. `2026-04-23-hitl-afk-label-for-linear-issues.md` — add HITL/AFK label to our Linear workflow; teach `ralph-start` to prefer AFK issues.
3. `2026-04-23-ralph-implement-step-3-scope-tightening.md` — expand `ralph-implement` Step 3 with an explicit scope-adherence checkpoint before Step 4 verification.

Pilot-gated recommendations (`/grill-me`, `karpathy-coder`, spec-completeness validator, PRD-only Phase 2) do NOT get ADRs here — they're Pass 2 work.

---

# Ticket structure

- **This recon ticket (ENG-246):** Pass 1 + recon doc + three ADRs. Scope delta vs PRD: Pass 2 is carved out to a follow-up (rationale in the Scope Note at the top — Pass 2 is architecturally "fresh session per component," not a single-session deliverable). ENG-246 still blocks ENG-247 (the Execute parent) as originally planned — ENG-247 needs the arm lists produced here.
- **ENG-259 — Pass 2 pilot shortlist for ENG-246 harness recon.** Blocked by ENG-246; blocks ENG-247. Covers the four pilot candidates surfaced here (`/grill-me` as Phase 1 arm; `karpathy-coder` as pre-commit warning; spec-completeness validator at Phase 1→2; plus any unresolved Phase 3 C-vs-D ranking after narrative observation). Pass 2 observations may refine the arm lists before ENG-247 starts executing.
- **ENG-260 — Lift Phase-1 prompts from external repos into ralph-spec / brainstorming.** Independent; does not block ENG-247. Covers the five prompt-level items in Cross-cutting finding #5.

ENG-178 remains Done. ENG-247 (the Execute parent) stays as-is; its arm lists are replaced by the Recommended Arm Lists section above, and its blocker set becomes {ENG-246, ENG-259}.
