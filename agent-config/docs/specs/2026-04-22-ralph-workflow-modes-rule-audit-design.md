# Ralph workflow modes & autonomous-mode rule audit

## Context

`agent-config/CLAUDE.md` (88 lines) is the project-level CLAUDE.md loaded into every Claude Code session in this repo. It currently describes rules with an implicit assumption that Sean is at the keyboard ("STOP and ask for clarification", "discuss architectural decisions together", etc.) — but ralph v2 (per ENG-178, Done) is becoming the default workflow, and ralph dispatches autonomous `claude -p` implementation sessions where no human is available to consult.

Three problems result:

1. **No mode framing.** CLAUDE.md doesn't acknowledge that two operational modes exist (interactive vs autonomous). Readers can't tell which rules apply when.
2. **Rule-mode mismatch.** ~12 rules say "STOP and ask Sean" — impossible in autonomous mode. The agent has no documented escape hatch.
3. **Discoverability gap.** `agent-config/docs/playbooks/ralph-v2-usage.md` already exists as the ralph operations playbook (15 lines), but CLAUDE.md never references it.

This spec adds mode framing, audits the rules, and documents an autonomous-mode escape hatch — without significantly growing CLAUDE.md (the heavy override content lives in the playbook, not in CLAUDE.md).

## Scope

**In scope:**

- Add `## Workflow modes` section to `agent-config/CLAUDE.md` between `## Foundational rules` and `## Our relationship`.
- Append `(autonomous: see playbook)` pointer marker to 12 specific rules in CLAUDE.md (enumerated below).
- Append `## Autonomous mode overrides` section to `agent-config/docs/playbooks/ralph-v2-usage.md`, containing: the escape hatch, enumerated exit triggers, default-to-exit-on-uncertainty rule, per-rule mapping for the 12 marked rules, and a "Things that still apply" subsection.

**Out of scope** (deferred to follow-up ticket — see "Follow-up work" below):

- "Implementation latitude" sections in `/ralph-spec` output (Layer 2 from design discussion).
- Updating autonomous executors (`ralph-implement`, `subagent-driven-development`) to honor implementation-latitude sections.
- Restructuring or rewording any existing CLAUDE.md rules beyond appending the pointer marker.
- Updating `/ralph-spec`, `/ralph-start`, `/prepare-for-review`, or other skill SKILL.md files.
- Updating `/Users/seankao/.claude/CLAUDE.md` directly — chezmoi handles propagation from the source file.

**Non-goals:**

- Not making CLAUDE.md a complete autonomous-mode runbook. CLAUDE.md gets mode framing + pointer markers; the playbook gets the override content.
- Not retroactively re-evaluating rule content. The audit asks "does this rule need an autonomous override?" not "is this rule still right?"

## Design

### Approach choice (sub-shape of "pointer + audit")

Of two viable shapes considered, **single override section + cross-reference markers** was chosen over inline tags. Rationale: CLAUDE.md is loaded into every session — keeping autonomous-mode content out of CLAUDE.md's body means interactive sessions don't pay the context tax. Pointer markers give the maintenance signal without inline duplication. The override section lives in the playbook (existing file, already a hybrid operator-facing/agent-facing doc) rather than CLAUDE.md or a new file, to minimize CLAUDE.md growth and avoid creating a new file pattern.

### Autonomous-mode escape hatch (mechanism)

When the autonomous agent would normally STOP and ask Sean, it instead:

1. Posts a Linear comment to the issue it's implementing, describing what's blocking.
2. Exits clean (no PR, no In Review transition).

The orchestrator records this as `exit_clean_no_review` in `progress.json`. Sean triages on the next pass.

This is a layered mechanism:

- **Enumerated exit triggers** (Layer 1) — concrete categories of decisions that always exit clean (architectural deviation, scope deviation, throwing away/rewriting, backcompat, spec contradiction, stuck, setup gap). Covers obvious cases.
- **Default to exit on uncertainty** (Layer 3) — when the agent can't classify a decision as routine vs architectural, treat as architectural and exit clean.

(Layer 2 — pushing the bright line into the spec via an "Implementation latitude" section — is deferred to follow-up.)

### Content: `## Workflow modes` section in CLAUDE.md

Insert as a new top-level section between `## Foundational rules` and `## Our relationship`.

```markdown
## Workflow modes

Work happens in one of two modes:

- **Interactive** — Sean is at the keyboard. Default mode, including `/ralph-spec`
  (spec authoring), `/prepare-for-review` (review handoff), `/close-feature-branch`
  (merge), and any non-ralph work.
- **Autonomous** — a `claude -p` session dispatched by `/ralph-start` to implement
  an Approved Linear issue. No human in the loop until the session exits.

For ralph operations (when to run `/ralph-start`, what `progress.json` outcomes
mean, triaging failed sessions) **and autonomous-mode behavioral overrides**,
see `agent-config/docs/playbooks/ralph-v2-usage.md`.

Most rules below apply in both modes. Rules that need autonomous-mode-specific
behavior are marked `(autonomous: see playbook)`.
```

### Content: `## Autonomous mode overrides` section in the playbook

Append as a new top-level section at the end of `agent-config/docs/playbooks/ralph-v2-usage.md`.

```markdown
## Autonomous mode overrides

Behavioral overrides for autonomous-mode sessions (a `claude -p` session
dispatched by `/ralph-start`). For interactive mode, the rules in
`agent-config/CLAUDE.md` apply as written. Rules in CLAUDE.md marked
`(autonomous: see playbook)` are mapped here.

### The escape hatch

When you would normally STOP and ask Sean, do this instead: **post a Linear
comment to the issue you're implementing describing what's blocking, then
exit clean (no PR, no In Review transition).** The orchestrator records this
as `exit_clean_no_review` in `progress.json`; Sean triages on the next pass.

### Enumerated exit triggers

Exit clean (per above) when you hit any of these:

- **Architectural deviation** — a fundamentally different approach than the
  spec described, or a cross-cutting change (auth, schema, build config) when
  the spec was about a feature.
- **Scope deviation** — adding or removing functionality vs what the spec
  specified.
- **Throwing away or rewriting an existing implementation** beyond what the
  spec directs.
- **Backward compatibility** — any backcompat shim or rename-with-alias.
- **Spec contradicts the code** — the spec describes a state of the world
  that doesn't match what's there, in a way you can't reconcile.
- **Stuck** — same operation tried 3 times without progress, or ≥30 minutes
  of compute on the same subgoal without convergence.
- **Setup gap** — repo isn't initialized, uncommitted changes present, or
  any precondition the orchestrator should have established but didn't.

### Default to exit on uncertainty

When you can't classify a decision as routine vs architectural, treat as
architectural and exit clean. Wasted overnight cycles are cheaper than
wrong-direction overnight cycles.

### Per-rule mapping

Rules in CLAUDE.md flagged with `(autonomous: see playbook)`:

**Exit clean** (per the escape hatch above):

- *Our relationship*: "speak up when you don't know" / "STOP and ask for
  clarification" / "STOP and ask for help" / "We discuss architectural
  decisions together"
- *Proactiveness*: "Only pause to ask for confirmation when [list]" — every
  condition in the list becomes an exit-clean condition.
- *Writing code*: "NEVER throw away or rewrite implementations" / "approval
  before backward compatibility"
- *Version Control*: "STOP and ask permission to initialize" / "STOP and
  ask how to handle uncommitted changes"
- *Testing*: "raise the issue with Sean [for failing test deletion]"

**Comment and continue:**

- *Testing*: "warn Sean about [mocked-behavior tests]" — leave a Linear
  comment noting the finding; continue with the spec's work (unless the
  spec is about those tests).

**Don't do it in autonomous mode:**

- *Linear authorization*: "confirm before deleting issues or comments" —
  never delete issues or comments in autonomous mode.

### Things that still apply

Linear authorization (edit descriptions, comment, change state, manage
labels, file new issues, set relations on the dispatched issue and judged-
relevant issues) applies fully — the escape hatch leans on this. Codex
usage (codex-rescue, codex-review-gate) applies fully — `/prepare-for-review`'s
codex gate runs from the autonomous session.
```

### Audit table: rules to mark with `(autonomous: see playbook)`

12 rules total. Each is identified by its current section in `agent-config/CLAUDE.md` and a distinguishing substring (line numbers will shift after the Workflow modes section is inserted, so locate by content, not line). The marker is appended at the end of the rule (after the period that ends the bulleted item or sentence). Marker text is exactly `(autonomous: see playbook)`.

| # | Section | Distinguishing substring | Where to append marker |
|---|---------|--------------------------|------------------------|
| 1 | Our relationship | `YOU MUST speak up immediately when you don't know something` | End of the bullet |
| 2 | Our relationship | `YOU MUST ALWAYS STOP and ask for clarification` | End of the bullet (after the period) |
| 3 | Our relationship | `If you're having trouble, YOU MUST STOP and ask for help` | End of the bullet (after "valuable.") |
| 4 | Our relationship | `We discuss architectural decisions` | End of the bullet (after "discussion.") |
| 5 | Proactiveness | `Only pause to ask for confirmation when` | End of the indented sub-list (after the last sub-bullet's period) |
| 6 | Linear authorization | `Still confirm before deleting issues or comments` | End of the sentence (after "(loses history).") |
| 7 | Writing code | `YOU MUST NEVER throw away or rewrite implementations without EXPLICIT permission` | End of the bullet (after "ask first.") |
| 8 | Writing code | `YOU MUST get Sean's explicit approval before implementing ANY backward compatibility` | End of the bullet |
| 9 | Version Control | `If the project isn't in a git repo, STOP and ask permission to initialize` | End of the bullet |
| 10 | Version Control | `YOU MUST STOP and ask how to handle uncommitted changes or untracked files` | End of the bullet (after "Suggest committing existing work first.") |
| 11 | Testing | `Never delete a test because it's failing` | End of the bullet (after "raise the issue with Sean.") |
| 12 | Testing | `YOU MUST NEVER write tests that "test" mocked behavior` | End of the bullet (after "warn Sean about them.") |

### Marker convention

The exact pointer-marker text is `(autonomous: see playbook)`. Conventions:

- Lowercase `autonomous`, lowercase `playbook`, no trailing period inside the parens.
- Always preceded by a single space (` (autonomous: see playbook)`).
- Always appended at the END of the rule, after the rule's terminating punctuation.
- For multi-sentence rules (e.g. rule #5 with its sub-list), the marker goes after the entire rule block ends — not in the middle.
- For bulleted rules, the marker appears on the same line as the bullet's closing text.

### Rules explicitly NOT marked

For audit completeness, these rules were considered and intentionally not marked:

- `address your human partner as "Sean"` — identity context, not a behavior rule.
- `NEVER write the phrase "You're absolutely right!"` — style rule, applies in both modes.
- `When you disagree with my approach, YOU MUST push back` — interactive framing; in autonomous mode there's no live "approach" to disagree with. Implicit non-applicability is sufficient.
- `use a git worktree` / `When starting work without a clear branch... create a WIP branch` — satisfied by construction in ralph (orchestrator already provides worktree and branch).
- `Fix broken things immediately when you find them` — applies in both modes.
- All TDD, debugging, code-quality, naming, comment, commit, hook, testing-style, doc-update rules — applicable in both modes without modification.

## Implementation steps

Execute in order. Each step is a small, verifiable unit.

1. **Insert `## Workflow modes` section** in `agent-config/CLAUDE.md` between `## Foundational rules` and `## Our relationship`. Use the exact content from the "Content: `## Workflow modes` section in CLAUDE.md" section above.

2. **Append pointer markers** to the 12 rules per the audit table. Use the distinguishing substring to locate each rule. Marker text and placement per the "Marker convention" subsection.

3. **Append `## Autonomous mode overrides` section** to `agent-config/docs/playbooks/ralph-v2-usage.md`. Use the exact content from the "Content: `## Autonomous mode overrides` section in the playbook" section above.

4. **Run verification** (see "Verification" below).

5. **Commit** the changes. Single commit, message format matching repo style: `docs: articulate ralph workflow modes and autonomous-mode rule overrides (ENG-NNN)`. Body should summarize the three additions (Workflow modes section, 12 markers, override section in playbook).

## Verification

Post-implementation checks:

1. `grep -c "(autonomous: see playbook)" agent-config/CLAUDE.md` returns exactly **12**. (If different, audit table is wrong or rules were missed/double-marked.)
2. `agent-config/docs/playbooks/ralph-v2-usage.md` contains a `## Autonomous mode overrides` section, and that section's "Per-rule mapping" subsection covers each of the 12 marked rules.
3. Manual readthrough of CLAUDE.md top-to-bottom: `## Workflow modes` reads naturally between Foundational rules and Our relationship; pointer markers don't disrupt rule readability.
4. Manual readthrough of playbook: new override section flows after existing operational content; no broken cross-references.
5. No regressions: every rule that existed in CLAUDE.md before still exists, only modified by appended pointer markers where flagged. (`git diff` should show only insertions, no deletions of substantive text.)
6. The Workflow modes section's playbook reference resolves: `agent-config/docs/playbooks/ralph-v2-usage.md` exists at that exact path.

## Follow-up work (NOT in this ticket)

A separate Linear ticket will cover **Layer 2** (the implementation-latitude mechanism deferred from design discussion):

- Update `/ralph-spec` (in `~/.claude/skills/ralph-spec/SKILL.md`) to emit an "Implementation latitude" section in every spec it produces. Two lists per spec: "implementer decides" and "reserved for human review."
- Update autonomous executors (`agent-config/skills/ralph-implement/SKILL.md`, `agent-config/superpowers-overrides/subagent-driven-development/SKILL.md`) to read the spec's implementation-latitude section and honor it (specifically, treat anything in "reserved for human review" as an exit trigger).

That ticket is `blocked-by` this ticket because it builds on the autonomous-mode-overrides section's existence in the playbook (its mechanism extends the per-rule mapping with a per-spec mapping).

## Open questions

None at spec time. All design questions were resolved during the spec dialogue.
