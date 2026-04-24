# SDD task-loop base-SHA routing fix (ENG-223)

## Problem

The `subagent-driven-development` (SDD) override's per-task process flow diagram
has a routing gap. In
`agent-config/superpowers-overrides/subagent-driven-development/SKILL.md`, the
diagram entry from "Read plan, extract all tasks…" routes through the
`"Record task base SHA (git rev-parse HEAD)"` node before dispatching the first
implementer subagent (line 73). But the loop-back edge for subsequent tasks
short-circuits that node:

```dot
"Mark task complete in TodoWrite" -> "More tasks remain?";
"More tasks remain?" -> "Dispatch implementer subagent (./implementer-prompt.md)" [label="yes"];
```

Consequence: only task 1 has a fresh base SHA. For task N≥2, the per-task
`codex-review-gate` invocation reuses the stale task-1 base SHA, so its diff
spans tasks 1..N — not just task N. This defeats the per-task review's intent
(catch cross-model blind spots in each task's individual changes) and drags
the review's signal toward cross-task integration concerns that the *final*
codex review is already responsible for.

The bug exists on `main` independent of ENG-220; it was discovered during
ENG-220's codex review of unrelated changes to the SDD override.

## Fix

Two narrowly-scoped documentation edits.

### Edit 1 — SDD override diagram

**File:** `agent-config/superpowers-overrides/subagent-driven-development/SKILL.md`

**Change:** redirect the `[yes]` edge out of `"More tasks remain?"` so it
enters the existing `"Record task base SHA (git rev-parse HEAD)"` node instead
of jumping straight to `"Dispatch implementer subagent ..."`.

**Before (line 93):**

```dot
"More tasks remain?" -> "Dispatch implementer subagent (./implementer-prompt.md)" [label="yes"];
```

**After:**

```dot
"More tasks remain?" -> "Record task base SHA (git rev-parse HEAD)" [label="yes"];
```

No new nodes are introduced; the forward edge
`"Record task base SHA (git rev-parse HEAD)" -> "Dispatch implementer subagent (./implementer-prompt.md)"`
already exists at line 74 and now serves both the first-task entry (from
"Read plan…") and the loop-back from "More tasks remain? [yes]". No other
edges, nodes, or sections of the diagram change. The `[no]` edge from
`"More tasks remain?"` to `"Dispatch final code reviewer subagent ..."`
is unchanged.

### Edit 2 — Patches doc description

**File:** `agent-config/docs/playbooks/superpowers-patches.md`

**Section:** `## 5. subagent-driven-development/SKILL.md`, "Process flow diagram
— per-task cluster" subsection (around lines 256–268).

**Change:** the existing fragment lists the forward edge
`"Record task base SHA (git rev-parse HEAD)" -> "Dispatch implementer subagent ..."`
but does not state the loop-back entry into the SHA-recording node. Add a single
edge line to that fragment so a future re-applier sees both entries into
`"Record task base SHA"`:

```dot
"More tasks remain?" -> "Record task base SHA (git rev-parse HEAD)" [label="yes"];
```

Place it adjacent to the existing `"Record task base SHA..." -> "Dispatch implementer..."`
line so the two-edge entry/exit pair is visually grouped.

Do **not** rewrite the rest of section 5. Do **not** restate the bug or its
history in the patches doc — that belongs in the Linear issue and this spec,
not in a patch-intent description.

## Out of scope

- **Example Workflow prose** (SKILL.md lines 139–228). Already uses
  `"(using task base SHA)"` per task. No prose change improves clarity here.
- **Symlink re-wiring.** The plugin cache file at
  `~/.claude/plugins/cache/claude-plugins-official/superpowers/5.0.7/skills/subagent-driven-development/SKILL.md`
  is already a symlink to the override (verified during spec authoring).
  Editing the override propagates automatically.
- **Hunting for similar routing bugs in other override diagrams.** If the
  implementer notices one while editing, file a new Linear issue under the
  Agent Config project; do not fix in this commit.
- **Reshaping or simplifying the SDD diagram.** Minimal one-edge redirection
  only. No node renames, no edge consolidation, no whitespace reflows.

## Verification

This is a pure documentation change — editing a Graphviz dot graph inside a
Markdown SKILL.md and adding one line to a Markdown patch description. There
is no runtime behavior to assert on.

**TDD exception (Rule #1).** The user-global rule "FOR EVERY NEW FEATURE OR
BUGFIX, YOU MUST follow Test Driven Development" presupposes testable behavior.
A diagram is prose; the correctness check is graph topology. Sean granted
this exception explicitly during spec authoring on 2026-04-24. No tests are
required, and no test failures will result from this commit.

**Verification steps:**

1. Read the edited `SKILL.md` per-task diagram block. Confirm:
   - Exactly one edge leaves `"More tasks remain?"` with label `"yes"`, and
     it points at `"Record task base SHA (git rev-parse HEAD)"`.
   - The forward edge from `"Record task base SHA (git rev-parse HEAD)"` to
     `"Dispatch implementer subagent (./implementer-prompt.md)"` is still
     present (it was line 74 pre-edit) and is now reached from two predecessors:
     `"Read plan, extract all tasks…"` (first task) and `"More tasks remain?"`
     (subsequent tasks).
   - The `[no]` edge from `"More tasks remain?"` to
     `"Dispatch final code reviewer subagent ..."` is unchanged.
   - No other edges or nodes were added, removed, or renamed.
2. Optional: render the dot graph (e.g. `dot -Tsvg`) and visually confirm the
   loop routes through the SHA-recording node. Not required for sign-off.
3. Read the edited `superpowers-patches.md` section 5. Confirm a single new
   edge line `"More tasks remain?" -> "Record task base SHA (git rev-parse HEAD)" [label="yes"];`
   appears in the per-task cluster fragment, adjacent to the existing forward
   edge from that node. Confirm no other content in section 5 changed.

## Files touched

- `agent-config/superpowers-overrides/subagent-driven-development/SKILL.md`
  (one edge redirected)
- `agent-config/docs/playbooks/superpowers-patches.md` (one edge line added
  to section 5's diagram fragment)

## Prerequisites

None. Self-contained.

## Commit shape

Single commit, docs-only.

Suggested message:

```
fix(eng-223): SDD task loop routes through Record-base-SHA so per-task codex review is correctly scoped
```
