---
name: prune-completed-docs
description: Use when there are too many docs, docs feel stale, plans have been completed, or memory files are getting bloated. Triggers on phrases like "too many docs", "clean up docs", "compact documentation", "docs are getting unwieldy", "archive old plans", or when the user wants to reduce documentation sprawl.
model: sonnet
allowed-tools: Read, Glob, Grep, Bash(git:*), Edit, Write
---

> **If not already announced, announce: "Using prune-completed-docs to [purpose]" before proceeding.**

# Prune Completed Docs

## Overview

Projects accumulate docs faster than they shed them. Completed implementation plans, superseded design notes, and redundant memory entries pile up until no one trusts any of it. This skill audits all documentation in a project and reduces it to a minimal, accurate set.

**Core principle:** A doc that no one reads is worse than no doc — it dilutes the signal.

## When to Use

- Plans directory has docs for features that are already merged/shipped
- MEMORY.md is approaching or over 200 lines
- Design docs describe architecture that has since changed
- Decision records duplicate information already in MEMORY.md

## Survey Phase

Catalog all doc locations before touching anything:

```
docs/plans/          — implementation plans (usually delete when done)
docs/decisions/      — architectural decision records (keep, but deduplicate with memory)
memory/MEMORY.md     — persistent memory index
memory/*.md          — individual memory files
CLAUDE.md            — project instructions (handle carefully — don't compact)
```

Read each file to determine its category:

| Type | Keep if | Action when done |
|------|---------|-----------------|
| Implementation plan | Has open `- [ ]` tasks | Delete — task checklist, code is the ground truth |
| Design spec | Default KEEP. Read full body for trade-offs, constraints, rejected alternatives. | Only delete if purely an implementation checklist with zero reasoning. Optionally promote to decision record. |
| Decision record | Captures WHY a decision was made | Keep unless pure duplication of MEMORY.md |
| Memory file | Still accurate and relevant | Delete if stale, merged into MEMORY.md, or wrong |

## Classification Rules

**Plans** are the easiest call: if every `- [ ]` checkbox is ticked, or if the feature shipped and is confirmed working, the plan has served its purpose. Delete it — the implemented code is the ground truth now.

**Design specs default to KEEP.** Most specs contain non-obvious reasoning — trade-offs, rejected alternatives, API constraints discovered during implementation, scope decisions. This reasoning is often embedded in the body, not the headings. A shallow scan of titles will systematically miss it.

Before proposing to delete a spec, you MUST read the full file and look for:
- Trade-offs: "we chose X over Y because..."
- Rejected alternatives: "considered Z but..."
- API/library constraints: "this approach doesn't work because..."
- Scope decisions: "deliberately deferred X" or "out of scope because..."
- Future context: follow-up tickets, known limitations, planned evolution

**Only delete a spec when it is purely an implementation checklist with no reasoning whatsoever** — no "why", no constraints, no alternatives, just steps. This is rare. If in doubt, keep it.

When a spec IS worth keeping and its implementation is complete, you may optionally promote it to `docs/decisions/` — strip implementation details that are now in code; keep the *why* and *what we learned*.

**Decision records** (ADRs) justify WHY things are the way they are. These have more lasting value than plans. Keep them unless the content is *verbatim* in MEMORY.md already. If it's summarized there, keep the full ADR for depth.

**MEMORY.md** should stay under ~150 lines for the index. If it's growing past 200 lines, look for:
- Entries that describe current code structure (derivable from reading code — delete)
- Entries about completed one-off tasks (no longer relevant — delete)
- Duplicate entries covering the same topic — merge

**Memory files** (the individual `.md` files that MEMORY.md links to) should be deleted when their content is wrong, when the entry is ephemeral context, or when the entry was for a task that is now done.

## Proposed Changes Protocol

**Do not delete or modify anything without presenting a list to the user first.**

Present your findings as:

```
## Proposed deletions
- docs/plans/2026-03-04-engine-design.md — Phase 1 complete, all tasks shipped
- docs/plans/2026-03-17-rust-wasm-implementation-plan.md — Phase 3 complete

## Proposed promotions (spec → decision record)
- docs/specs/2026-04-07-visual-regression-tests.md → update with implementation lessons (threshold change), move to docs/decisions/

## Proposed merges (content worth keeping, but lives somewhere better)
- docs/decisions/2026-03-07-solver-correctness-fixes.md → already summarized in MEMORY.md under "Solver bugs fixed" — can delete if you agree the MEMORY.md entry is sufficient

## MEMORY.md trimming suggestions
- Remove lines 45-52 (describes file structure that's derivable from reading the repo)
- Merge "TT Redesign" and "PIMC Benchmarks" sections — both are complete, just need the baselines preserved

## Keep as-is
- docs/decisions/2026-03-05-engine-implementation-decisions.md — deep rationale not in MEMORY.md
```

Wait for explicit approval before executing.

## Execution

After approval, execute changes in this order:

1. **Delete approved files** — `rm` them; they're recoverable from git if needed
2. **Edit MEMORY.md** — remove or trim approved sections, update the index links
3. **Delete orphaned memory files** — any file no longer linked from MEMORY.md
4. **Verify** — re-read MEMORY.md and confirm the index is coherent and all links point to real files

## What Not to Touch

- `CLAUDE.md` — project instructions, not documentation; out of scope
- Any doc with open `- [ ]` tasks — may still be needed
- Decision records that explain non-obvious architectural choices with no MEMORY.md equivalent
- Anything the user says to keep

## Common Mistakes

**Shallow-scanning specs and proposing bulk deletion** — The most common failure mode. A title like "column tooltips design" sounds trivial, but the spec may document that DaisyUI's built-in tooltip gets clipped inside overflow containers, forcing an architectural pivot to @floating-ui. You cannot assess a spec from its title or headings alone. Read the full body before classifying. When in doubt, keep.

**Delegating spec reads to a fast subagent** — Subagents optimize for speed and will skim rather than read carefully. Design reasoning is often a single sentence buried in a paragraph of implementation detail. If you delegate the survey, verify the subagent's DELETE recommendations by re-reading those files yourself before proposing them to the user.

**Auto-deleting specs along with plans** — Plans are task checklists; specs are design docs. Plans can be deleted mechanically (all checkboxes ticked → delete). Specs require judgment — read first, always.

**Deleting ADRs that look "done"** — ADRs aren't task lists. Their value is the preserved reasoning, not their completeness. Only delete if MEMORY.md already captures the essence.

**Over-trimming MEMORY.md** — The goal is signal density, not minimum line count. If a section is dense with accurate, useful context, leave it.

**Assuming shipped = obsolete** — Some plan docs contain design rationale embedded in the task descriptions. Skim for prose sections before deleting.
