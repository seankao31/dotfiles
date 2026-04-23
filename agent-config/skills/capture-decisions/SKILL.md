---
name: capture-decisions
description: Use before ending a session where non-obvious implementation choices were made — whether through discussion, on-the-fly debugging, or automatic fixes applied by skills. Triggers on phrases like "wrap up", "end session", "document decisions", "capture what we did", "before we finish". Especially important after a plan execution session where unforeseen issues came up.
model: sonnet
allowed-tools: Read, Glob, Grep, Bash(git:*), Write, Edit
---

# Capture Decisions

## Overview

Sessions produce decisions that live nowhere. The code gets written, but the *why* — the alternatives considered, the failed attempts, the "this looks wrong but isn't" traps — evaporates when the conversation ends. This skill captures that context before it's gone.

**Run this while the session is still live.** You still have the full conversation context. That's the only time you know why something is the way it is.

## What to Capture

Three categories, in order of importance:

**1. "Don't touch this" decisions** — Code that looks like a bug, a missed optimization, or an obvious refactor target, but is deliberately that way. Future agents (and future you) will "fix" these. They must be protected with comments.

Examples:
- A performance-critical data structure that looks inefficient
- A no-op handler that exists intentionally
- An unusual algorithm choice where the obvious alternative was tried and failed
- A constraint that comes from an external requirement (hardware, protocol, API limit)

**2. Architectural decisions** — Choices with broader design implications that future sessions should know about before touching related code. Goes in `docs/decisions/`.

Examples:
- Why a component is stateless vs stateful
- Why two things that look like they should be merged are kept separate
- A deliberate tradeoff (correctness vs speed, flexibility vs simplicity)

**3. Project-level context** — Facts a future session should have in MEMORY.md to avoid repeating the investigation.

Examples:
- Performance baselines measured this session
- A platform constraint discovered during testing
- An API behavior that wasn't documented

## Workflow

### Step 1: Reconstruct the session

```bash
git log --oneline -20          # What commits were made?
git diff HEAD~N                # What actually changed? (replace N with commit count)
```

Read the diff with fresh eyes. Ask: *What would a developer seeing this cold think is wrong?*

Also scan the current conversation for:
- Decisions made after discussion ("let's do X not Y because...")
- Issues surfaced by skills (systematic-debugging findings, TDD red paths)
- Things that were tried and didn't work

### Step 2: Triage each decision

For every non-obvious choice identified, assign it to one or more buckets:

| What it is | Where it goes |
|------------|---------------|
| Code that looks wrong but isn't | Inline comment at the site |
| Design tradeoff with lasting implications | `docs/decisions/YYYY-MM-DD-short-title.md` |
| Project context for future sessions | MEMORY.md update |
| Obvious or derivable from code | Skip — don't add noise |

When in doubt: if a future agent would reasonably "fix" it, protect it. If the code is self-explanatory, leave it alone.

### Step 3: Present the list

Before writing anything, show the user:

```
## Proposed inline comments
- engine-rs/src/solver.rs:142 — explain depth-aware replacement beats always-overwrite
- src/engine/solver.worker.ts:55 — explain why newGame handler is a no-op for PIMC workers

## Proposed ADR
- docs/decisions/2026-03-18-tt-replacement-policy.md
  Context: always-overwrite gave 1.2× speedup at 99% fill; depth-aware gives 200×

## MEMORY.md updates
- Add PIMC performance baselines to Rust/WASM section

## Skipping (obvious or already documented)
- The resetCardIds() call in startGame — covered by existing comment
```

Wait for approval before writing. (In autonomous sessions, skip this gate — see § Autonomous sessions.)

### Step 4: Execute

**Inline comments** — Add at the exact decision site. Format:
```
// [Why this choice]: [one-sentence reason]. [What the wrong alternative was, if relevant.]
```

Concrete examples:
```rust
// Depth-aware replacement: keeps higher-depth (closer-to-root) entries on eviction.
// "Always overwrite" at 99% fill gave only 1.2× turn-2 speedup; depth-aware gives 200×.

// No-op: PIMC workers use wasm_simulate (fresh TT per call) — no persistent state to reset.
// For All Open, use WasmSolver.solve() which reuses the TT across turns.
```

**ADR docs** — Use this structure in `docs/decisions/YYYY-MM-DD-title.md`:
```markdown
# [Decision Title]

## Context
[What problem forced this decision?]

## Decision
[What was decided.]

## Reasoning
[Why this over the obvious alternatives. Name the alternatives and why they were rejected.]

## Consequences
[What this means for future changes to this code.]
```

**MEMORY.md** — Add to the relevant section. Keep entries dense; one line per fact is fine.

### Step 5: Commit

```bash
git add docs/decisions/ src/ engine-rs/
git commit -m 'docs: capture session decisions and add explanatory comments'
```

## Autonomous sessions

In autonomous sessions (`claude -p` dispatched by `/ralph-start`), there is no human to approve the proposal. Skip Step 3's approval gate and proceed immediately to Step 4 (Execute) after forming the proposal. The reviewer sees the resulting decisions in `/prepare-for-review`'s handoff comment under **Documentation changes** — that's the review surface, not a per-skill approval.

See `agent-config/CLAUDE.md` § Autonomous mode for the general autonomous-mode behavior model (this is the skill-specific application).

## What Not to Do

**Don't document the process** — "We tried X then switched to Y" is a narrative, not a decision record. Write what the decision IS, not how you arrived at it.

**Don't add comments to obvious code** — If it reads clearly, leave it. Comments on self-explanatory code dilute the ones that matter.

**Don't create an ADR for every commit** — ADRs are for choices with forward-looking consequences. A bug fix is not an ADR unless the fix has a non-obvious implication.

**Don't pad MEMORY.md** — Only add things that a future session would otherwise need to re-investigate.
