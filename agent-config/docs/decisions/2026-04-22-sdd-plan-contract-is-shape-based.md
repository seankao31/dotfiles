# SDD's Plan Contract Is Shape-Based, Not Source-Based

## Context

While designing the Phase 3 arms for ENG-178's workflow evaluation, a question arose: can `subagent-driven-development` consume inputs other than `/writing-plans` output? The SDD SKILL.md's Integration section names writing-plans as "Creates the plan this skill executes" and its example reads a file at `docs/superpowers/plans/feature-plan.md`, implying a tight coupling to that specific skill's output format.

If that coupling were real, it would constrain Phase 3 arm design — arms that feed SDD from a PRD directly (without a prior plan-writing phase) would be invalid.

## Decision

SDD's actual input contract is **shape-based**, not source-based. Inferred by reading the prompt templates directly:

- `implementer-prompt.md` requires: `[FULL TEXT of task from plan]`, `[Scene-setting: where this fits, dependencies, architectural context]`, and `Follow the file structure defined in the plan`.
- `spec-reviewer-prompt.md` requires: `[FULL TEXT of task requirements]` per task for compliance verification.

The contract is: discrete tasks, full text per task, per-task context, prescribed file structure, per-task acceptance criteria. Any source yielding those properties is compatible.

## Reasoning

The `/writing-plans` coupling is documentation convention, not enforced contract. The SKILL.md body reads "Read plan, extract all tasks with full text, note context, create TodoWrite," but that's one path. A controller with strong reasoning can satisfy the same contract by extracting tasks from a denser spec (e.g., a PRD) without ever invoking `/writing-plans`.

Alternative interpretations considered and rejected:

- **SDD requires writing-plans output verbatim** — contradicted by the prompt templates, which don't name writing-plans or check for its sigil format.
- **SDD requires a "plan file" on disk** — the controller pastes task text inline; SDD implementer subagents never read the plan file directly. The file-on-disk is a convention, not a requirement.

## Consequences

Phase 3 arm design is freer than it first appeared. Specifically:

- **Arm E** (SDD decomposition, single-session execution) is valid: the controller can extract tasks from a PRD input without a writing-plans phase. This is what makes arm E distinct from arm A — same input (PRD), different execution discipline.
- **Future ralph-implement variants** that want SDD's review discipline without requiring writing-plans upstream are architecturally possible. If Phase 3 finds arm C or D wins, adoption can proceed without mandating a plan-writing stage.
- **Reading upstream prompt templates beats reading upstream SKILL.md descriptions** when evaluating what a skill actually requires. SKILL.md is the pitch; prompt templates are the contract.
