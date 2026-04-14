# Per-Task Codex Review Gate in Subagent-Driven Development

**Linear issue:** ENG-115
**Date:** 2026-04-14

## Problem

The codex-review-gate currently runs once at the end of subagent-driven-development, after all tasks are complete. This means cross-model blind spots in individual tasks go undetected until the final review, when they're harder and more expensive to fix.

## Design

Add a codex-review-gate invocation to the per-task review cycle in subagent-driven-development. The per-task flow changes from two-stage review to three-stage:

```
implement → spec review → code quality review → codex review → mark complete
```

### Per-task codex review

- Runs after code quality review approves, before marking the task complete
- Reviews the task's commits only (not the full branch diff)
- Follows the same STOP-and-ask-user protocol — no auto-fixing
- Assesses whether adversarial review is warranted for that task

### Final codex review (unchanged)

The whole-implementation codex review stays. It reviews the full branch diff for cross-task integration issues that per-task reviews cannot see.

## Files to change

### 1. `subagent-driven-development/SKILL.md`

- **Process flow diagram:** Add `"Run codex-review-gate for task changes"` node between `"Code quality reviewer subagent approves?"` and `"Mark task complete in TodoWrite"` inside the `cluster_per_task` subgraph.
- **Prose description (line 10):** Change "two-stage review" to "three-stage review (spec compliance, code quality, cross-model codex)".
- **Example workflow:** Add a codex review step after each task's code quality review passes.
- **Quality gates section:** Add per-task cross-model review.
- **Cost section:** Note additional codex invocations per task.
- **Red flags:** Add "Skip per-task codex review" to the never-do list.
- **Integration section:** Update codex-review-gate description to mention per-task usage.

### 2. `codex-review-gate/SKILL.md`

- **"When to Use" section:** List both checkpoints:
  - Per-task: after code quality review passes within subagent-driven-development
  - Final: after all tasks complete and final Claude code review passes (existing)

### 3. `writing-plans/SKILL.md`

- **Plan header template:** Update the codex-review-gate reference to mention per-task review in addition to the final review.

## Out of scope

- Brainstorming and writing-plans stages — no review gates added there.
- `executing-plans` skill — not used, not touched.
- `CLAUDE.md` — existing rule ("mandatory before any work is declared complete") already covers per-task usage.
