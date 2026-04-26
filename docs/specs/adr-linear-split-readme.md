# ADR / Linear-issue split — `agent-config/docs/decisions/README.md`

## Context

`agent-config/docs/decisions/` currently collapses two distinct decision shapes into a single ADR file format:

1. **Commit-shaped decisions** — "adopt X, here's why" — where rationale and implementation are the same unit of work. Examples already in the pile: the ADR adopting `verification-before-completion` in `ralph-implement` Step 4, and `config-sh-portability-caller-reorder.md`.
2. **Invariant / non-action decisions** — "X is always true," "we decided NOT to do Y," or long-lived "why X is done this way" notes. Examples already in the pile: `2026-04-22-trunk-detection-block-duplication.md`, `2026-04-22-sdd-plan-contract-is-shape-based.md`.

The two shapes have asymmetric failure modes:

- **Commit-shaped ADRs** can be filed without their implementation work landing. ENG-246 surfaced this concretely: the HITL/AFK-labels ADR (commit `ee58a872`, reverted in `7c11d8f`) was filed alongside two siblings that did get implemented, but its own implementation work was never done. Nothing on the ADR file flagged it as inert; the gap was caught only on wrap-up review. Linear issues have a triage → reject lifecycle that surfaces this case naturally.
- **Invariant ADRs** have no equivalent failure mode — they're durable-in-repo by design, with no implementation step that can dangle.

## Decision

Add `agent-config/docs/decisions/README.md` codifying a forward-only split:

- **Linear issue** for any decision with a load-bearing implementation step. Description carries `Context / Decision / Consequences / Alternatives considered`. Close on merge.
- **ADR file** for decisions with no implementation step: non-actions, architectural invariants, long-lived "why X is this way" notes that need to survive tracker regime changes.

The README serves a dual audience: the human operator browsing the repo, and the autonomous session (`/ralph-start`-dispatched or otherwise) that needs to answer "ADR or issue?" without further input.

## The single test

The README leads with one yes/no question:

> **Does this decision have a load-bearing implementation step?**
>
> - **Yes** → file a Linear issue.
> - **No** → write an ADR file.

This was chosen over multi-criterion framings (cited-from-prose, survives-tracker-regime, non-action) because the failure mode being solved is "filed but not applied" — and that failure mode is wholly determined by whether there's an implementation step to dangle. A single sharp test is also easier to apply autonomously than a checklist where edge cases require judgment.

### Alternatives considered

- **Multi-criterion description ("ADRs are for: A, B, C") with examples.** Rejected as the primary test because edge cases force the autonomous reader into judgment calls. Kept as supporting language under each shape's section, not as the test.
- **"Shape of the rationale, not shape of the work" framing** — even decisions that came with commits get an ADR if the rationale has durable cite-worthy value. Rejected because it would have pushed `codex-review-gate-caller-agnostic` into ADR territory by intent, not by accident, but it muddies the failure-mode story: the test would no longer mirror what the convention is solving.

## README structure (~40-60 lines)

Four parts, in order:

### Part 1 — Failure-mode preamble (one paragraph)

Names the failure mode the convention solves, citing the ENG-246 wrap-up case (HITL/AFK ADR filed but never applied; gap caught only on wrap-up review). Does not link the deleted file directly; references the commit SHAs only (`ee58a872` adds it, `7c11d8f` reverts it).

### Part 2 — The test

Exactly the yes/no question above, with the two-bullet branching answer. No additional commentary at this point — the examples that follow do the explanatory work.

### Part 3 — Per-shape sections

#### ADR file (no implementation step)

One sentence: "Use an ADR when the decision is itself the deliverable — no separate code change needs to land for the decision to take effect."

Three example ADRs from the existing pile, with one-line descriptions explaining why each is invariant-shaped:

- `2026-04-22-trunk-detection-block-duplication.md` — decided NOT to extract a helper. The load-bearing artifact is the absence of a change.
- `2026-04-22-sdd-plan-contract-is-shape-based.md` — codifies an invariant about SDD's input contract. Future arm design must respect this; no code change attached.
- `2026-04-22-codex-review-gate-caller-agnostic.md` — post-hoc rationale for an architectural pattern (primitives surface findings; callers own the response). The pattern was already in place when the ADR was written.

#### Linear issue (has implementation step)

One sentence: "File a Linear issue when the decision needs work to land. The triage → in-progress → review → done lifecycle is what catches the 'filed but not applied' failure mode."

Recommended description headings (mirrors ADR structure so rationale survives):

```
## Context
## Decision
## Consequences
## Alternatives considered
```

Project routing: defer to `agent-config/CLAUDE.md` § Linear (Agent Config / Sensible Ralph / Machine Config). Do not duplicate routing rules.

Three example commit-shaped decisions (existing or historical):

- `2026-04-23-adopt-verification-before-completion-in-ralph-implement.md` — adopting an upstream skill, modifying `ralph-implement` Step 4. Going forward this would be a Linear issue with the rationale in the description, closed on the commit landing the Step 4 edit.
- `2026-04-23-config-sh-portability-caller-reorder.md` — reordering source calls across four entry points. Pure code change; rationale belongs in the issue body and the commit.
- The reverted HITL/AFK ADR (added in `ee58a872`, reverted in `7c11d8f`) — exemplar of the failure mode. Filed alongside the two above, but unlike them the implementation work was never done. Under the new convention this would have been a Linear issue, and the triage-on-the-issue cycle would have surfaced the gap before wrap-up.

### Part 4 — Closing note: forward-only

Explicit one-paragraph statement:

> This convention is forward-only. Existing ADRs stay where they are. Retrofitting commit-shaped ADRs into closed Linear issues is churn for zero gain — the failure mode this convention solves is "filed but not applied," and historical commit-shaped ADRs that *were* applied don't have it. Future commit-shaped decisions go straight to Linear; future invariant decisions stay in this directory.

## Implementation

Single new file: `agent-config/docs/decisions/README.md`. No edits to existing ADR files. No new skill changes — the convention is human-and-agent-readable; no skill currently parses the `decisions/` directory.

## Acceptance criteria

The autonomous implementer can confirm the work is complete when:

- `agent-config/docs/decisions/README.md` exists and is committed to git.
- The yes/no test ("does this decision have a load-bearing implementation step?") appears as the first content after the failure-mode preamble.
- The ADR-shape section cites all three of: `trunk-detection-block-duplication.md`, `sdd-plan-contract-is-shape-based.md`, `codex-review-gate-caller-agnostic.md`.
- The Linear-issue-shape section cites all three of: `adopt-verification-before-completion-in-ralph-implement.md`, `config-sh-portability-caller-reorder.md`, and the reverted HITL/AFK ADR (by commit SHA `7c11d8f` for the revert and `ee58a872` for the original).
- The Linear-issue-shape section lists the four recommended description headings (`Context`, `Decision`, `Consequences`, `Alternatives considered`).
- The README references `agent-config/CLAUDE.md` for Linear project routing rather than restating them.
- The closing paragraph states the convention is forward-only and existing ADRs remain untouched.
- No existing ADR file is modified.

The README must be self-contained: a future session asked "ADR or issue?" should be able to answer from this file alone, without needing to read the originating Linear issue (ENG-266) or the ENG-246 wrap-up commit.

## Out of scope

- Edits to any existing ADR file.
- Retroactive conversion of historical commit-shaped ADRs into Linear issues.
- Any change to skills, hooks, or other tooling that would parse `decisions/` programmatically.
- Discussion of borderline ADRs (e.g., `2026-04-22-ralph-spec-visual-companion-glob.md`, which captured both an implementation choice and durable invariant-shaped constraints). Such cases are intentionally absent from the README's example lists; including them would dilute the test's clarity. Future operators encountering similar hybrids exercise judgment.

## Prerequisites

None. This is a single self-contained README addition with no code dependencies, no skill updates, and no upstream blockers.
