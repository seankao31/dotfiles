---
date: 2026-04-22
issue: ENG-217
---

# Trunk-Detection Block is Duplicated, Not Extracted

## Context

`clean-branch-history/SKILL.md` Step 1 and `prepare-for-review/SKILL.md`'s base-SHA computation block use nearly identical trunk-detection logic: try `origin/HEAD`, fall back through local `main`/`master`, then remote-tracking refs, exit 1 if none found. They look like an obvious helper-extraction target.

## Decision

Leave the block duplicated. Do not extract a shared trunk-detection helper.

## Reasoning

SKILL.md files are markdown prose that the agent reads, not importable scripts. A shared helper would need to be a tracked executable (shell script under `agent-config/`) that both skills shell out to, with its own tests and invocation contract. That's a substantially larger change than warranted by two call sites. When a **third** call site appears, the extraction cost becomes worthwhile.

Additionally, `finishing-a-development-branch` (the third skill that calls `clean-branch-history`) was deliberately NOT updated to pass `--base`. It's being retired in favor of the ralph v2 flow; trunk auto-detection covers the main/master case for anyone still using it without requiring `--base`.

## Consequences

- Future changes to trunk-detection precedence must be applied to both sites.
- When a third call site appears, that's the signal to extract a shared shell helper.
- `finishing-a-development-branch` should not be "fixed" to add `--base` — it's being retired.
