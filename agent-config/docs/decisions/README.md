# ADR or Linear issue?

`agent-config/docs/decisions/` holds two shapes of decision content that have asymmetric failure modes. The one that bites is commit-shaped decisions — "adopt X, here's why" — filed as ADR files without a lifecycle to track whether their implementation work ever lands. An ADR file has no triage state, no assignee, no in-progress → done arc; nothing flags it as inert when its implementation work is forgotten.

---

**Does this decision have a load-bearing implementation step?**

- **Yes** → file a Linear issue.
- **No** → write an ADR file.

---

## ADR file (no implementation step)

Use an ADR when the decision is itself the deliverable — no separate code change needs to land for the decision to take effect.

Examples from the existing pile:

- **`2026-04-22-trunk-detection-block-duplication.md`** — decided NOT to extract a helper. The load-bearing artifact is the absence of a change.
- **`2026-04-22-sdd-plan-contract-is-shape-based.md`** — codifies an invariant about SDD's input contract. Future arm design must respect this; no code change attached.
- **`2026-04-22-codex-review-gate-caller-agnostic.md`** — post-hoc rationale for an architectural pattern (primitives surface findings; callers own the response). The pattern was already in place when the ADR was written.

## Linear issue (has implementation step)

File a Linear issue when the decision needs work to land. The triage → in-progress → review → done lifecycle is what catches the "filed but not applied" failure mode.

Recommended description headings (mirrors ADR structure so rationale survives the tracker):

```
## Context
## Decision
## Consequences
## Alternatives considered
```

For project routing (Agent Config, Sensible Ralph, Machine Config), defer to `agent-config/CLAUDE.md` § Linear.

Examples — decisions that are or would be commit-shaped:

- **`2026-04-23-adopt-verification-before-completion-in-ralph-implement.md`** — adopting an upstream skill, modifying `ralph-implement` Step 4. Under this convention: a Linear issue with the rationale in the description, closed on the commit landing the edit.
- **`2026-04-23-config-sh-portability-caller-reorder.md`** — reordering source calls across four entry points. Pure code change; rationale belongs in the issue body and the commit.

---

This convention is forward-only. Existing ADRs stay where they are. Retrofitting commit-shaped ADRs into closed Linear issues is churn for zero gain — the failure mode this convention solves is "filed but not applied," and historical commit-shaped ADRs that *were* applied don't have it. Future commit-shaped decisions go straight to Linear; future invariant decisions stay in this directory.
