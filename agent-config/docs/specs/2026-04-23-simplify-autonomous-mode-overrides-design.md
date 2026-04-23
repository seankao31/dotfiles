# Simplify autonomous-mode overrides

## Context

ENG-228 (Done, landed 2026-04-22) added a three-layer autonomous-mode override structure to `agent-config/docs/playbooks/ralph-v2-usage.md`, plus 12 `(autonomous: see playbook)` pointer markers in `agent-config/CLAUDE.md`. The structure:

- **Layer 1** — enumerated exit triggers (architectural deviation, scope deviation, rewrites, backcompat, spec-contradicts-code, stuck, setup gap).
- **Layer 3** — default-to-exit on uncertainty.

(Layer 2 was deferred to ENG-229 for per-spec "Implementation latitude" sections.)

On reflection one day later, the layered framing is more machinery than the concept warrants:

- **Layer 1 is mostly redundant.** Five of the seven enumerated triggers (architectural deviation, scope deviation, rewrites, backcompat, setup gap) are restatements of existing CLAUDE.md rules, not net-new guidance. Only two items — spec-contradicts-code and stuck-heuristic — have no CLAUDE.md counterpart.
- **The 12 markers have a weaker case than assumed.** Every marked rule maps to the same autonomous-mode behavior. Twelve inline pointers that all resolve to one umbrella rule are line noise, not load-bearing cross-references.
- **Layer 3 is the only load-bearing behavioral rule.** "Default to exit on uncertainty" is what actually protects against rationalized continuations. Everything Layer 1 enumerates is an instance of what Layer 3 catches anyway.
- **ENG-229 (Layer 2) dissolves when Layers 1/3 collapse.** Its "Reserved for human review" list duplicates what specs should decide directly; its "Implementer decides" list was a Layer-3 relaxation that doesn't survive collapsing Layer 3 into the umbrella rule.

This spec collapses the three-layer framing into a single behavioral rule, preserves the two genuinely-new operational rules (spec-contradicts-code, stuck-heuristic) in a separate non-override section of the playbook, removes the 12 pointer markers from `agent-config/CLAUDE.md`, and replaces them with a single behavioral note in the existing `## Workflow modes` section. Net effect: the override mechanism is documented once, not twelve times.

## Scope

**In scope:**

- Rewrite the `## Autonomous mode overrides` section of `agent-config/docs/playbooks/ralph-v2-usage.md` — collapse to a single behavioral rule + mechanism + default-to-exit clause + carve-outs.
- Add a new `## Autonomous-mode operational rules` section to the same playbook, containing spec-contradicts-code and stuck-heuristic as standalone ops guidance.
- Remove all 12 `(autonomous: see playbook)` suffixes from `agent-config/CLAUDE.md` per the audit table in the Design section.
- Replace the `## Workflow modes` section's marker-explaining note in `agent-config/CLAUDE.md` with a direct behavioral note.

**Out of scope:**

- Changes to `/ralph-spec`, `/ralph-start`, `/ralph-implement`, or `agent-config/superpowers-overrides/subagent-driven-development`.
- Changes to the mechanism semantics (escape-hatch behavior, `exit_clean_no_review` outcome, comment-then-exit-clean pattern) — same mechanism, different packaging.
- Rewording any existing CLAUDE.md rule content beyond removing the marker suffix and rewriting the Workflow modes section's marker-note paragraph.
- Updating `/Users/seankao/.claude/CLAUDE.md` directly — chezmoi propagates from `agent-config/CLAUDE.md`.
- ENG-229 implementation. That ticket is canceled as part of this ticket's Linear finalization (not as a deliverable of this spec's implementation).

**Non-goals:**

- Not expanding either file. The simplification target is *net-negative* lines across both.
- Not enumerating more edge cases. If the single umbrella rule + default-to-exit don't cover a situation, exit clean.

## Design

### Approach choice (CLAUDE.md markers)

Three shapes were considered; option **B** was chosen.

- **A — Keep the 12 inline markers, simplify the playbook only.** Rejected: every marker points to the same umbrella rule, so per-rule pointers add noise without disambiguation value. Readers reading CLAUDE.md top-to-bottom would encounter 12 footnotes that all resolve to the same answer.
- **B — Remove all 12 markers; replace the Workflow modes section's marker-explaining note with a direct behavioral note. (Chosen.)** Single source of truth. Each CLAUDE.md rule reads normally without suffixes. The umbrella behavior is stated once, inline with the mode framing that motivates it.
- **C — Hybrid: keep markers on a "high-value" subset.** Rejected: no principled line between high-value and low-value when the mapped behavior is uniform. Inevitably drifts toward A or B under maintenance pressure.

### Rewritten playbook override section

Replace the full `## Autonomous mode overrides` section (and all its current subsections: "The escape hatch", "Enumerated exit triggers", "Default to exit on uncertainty", "Per-rule mapping", "Things that still apply") with:

```markdown
## Autonomous mode overrides

In autonomous mode (a `claude -p` session dispatched by `/ralph-start`), rules in `agent-config/CLAUDE.md` that say "STOP and ask Sean" — or that require Sean's confirmation, approval, or discussion — cannot apply as written: there's no human in the loop. Instead:

**Post a Linear comment on the issue you're implementing describing what's blocking, then exit clean (no PR, no In Review transition).** The orchestrator records this as `exit_clean_no_review` in `progress.json`; Sean triages on the next pass.

Default to that behavior on any decision you can't confidently classify as routine. Wasted overnight cycles are cheaper than wrong-direction overnight cycles.

Linear authorization (edit descriptions, comment, change state, manage labels, file new issues, set relations on the dispatched issue and judged-relevant issues) applies fully — the escape hatch leans on this. Codex usage (codex-rescue, codex-review-gate) applies fully — `/prepare-for-review`'s codex gate runs from the autonomous session. Deleting issues or comments is not permitted in autonomous mode.
```

### New playbook ops-rules section

Append immediately after the rewritten override section (so it sits between "Autonomous mode overrides" and the end of the file):

```markdown
## Autonomous-mode operational rules

Two standalone operational rules specific to autonomous sessions. They are not overrides of any CLAUDE.md rule — they have no interactive-mode counterpart:

- **Spec contradicts the code.** If the spec describes a state of the world that doesn't match the codebase in a way you can't reconcile — a file the spec says to edit doesn't exist, a function it references has a different signature, a prerequisite it assumes is missing — treat that as a spec bug, not an implementation puzzle. Post a comment and exit clean.
- **Stuck.** If the same operation has been tried 3 times without progress, or ≥30 minutes of compute has been spent on the same subgoal without convergence, exit clean. Fresh context is cheaper than compounding a confused approach.
```

### CLAUDE.md Workflow modes section update

In `agent-config/CLAUDE.md`'s `## Workflow modes` section, replace the existing two-line paragraph:

```markdown
Most rules below apply in both modes. Rules that need autonomous-mode-specific
behavior are marked `(autonomous: see playbook)`.
```

with:

```markdown
Most rules below apply in both modes. In autonomous mode, every rule below that says "STOP and ask Sean" — or requires Sean's confirmation, approval, or discussion — instead becomes: **post a Linear comment on the issue you're implementing, then exit clean.** Default to that on any decision you can't confidently classify as routine. See the playbook for the full mechanism and for autonomous-mode-only operational rules.
```

### CLAUDE.md marker removal (audit table)

Remove the trailing ` (autonomous: see playbook)` suffix from each of the 12 rules below. Locate by distinguishing substring — line numbers will shift after the Workflow modes paragraph is rewritten, so don't rely on them. In every case the suffix is *a leading space, followed by the parenthesized phrase, placed after the rule's terminating punctuation* — remove exactly that range.

| # | Section | Distinguishing substring |
| -- | -- | -- |
| 1 | Communication | `YOU MUST speak up immediately when you don't know something` |
| 2 | Communication | `YOU MUST ALWAYS STOP and ask for clarification` |
| 3 | Communication | `If you're having trouble, YOU MUST STOP and ask for help` |
| 4 | Communication | `We discuss architectural decisions` |
| 5 | Proactiveness | `Your partner specifically asks "how should I approach X?"` |
| 6 | Linear authorization | `Still confirm before deleting issues or comments` |
| 7 | Writing code | `YOU MUST NEVER throw away or rewrite implementations` |
| 8 | Writing code | `YOU MUST get Sean's explicit approval before implementing ANY backward compatibility` |
| 9 | Version Control | `If the project isn't in a git repo, STOP and ask permission to initialize` |
| 10 | Version Control | `YOU MUST STOP and ask how to handle uncommitted changes or untracked files` |
| 11 | Testing | `Never delete a test because it's failing` |
| 12 | Testing | `YOU MUST NEVER write tests that "test" mocked behavior` |

## Alternatives considered (rejected)

- **Keep the full ENG-228 three-layer structure.** Rejected per Context — the framing is more machinery than the concept warrants, and Layer 1 mostly restates rules already in CLAUDE.md.
- **Ship ENG-229 as originally scoped.** Rejected — the "Reserved for human review" list duplicates decisions specs should make directly; the "Implementer decides" list was a Layer-3 relaxation that doesn't survive Layer 3's collapse.
- **Delete the overrides section entirely.** Rejected — the escape-hatch *mechanism* (what comment to post, `exit_clean_no_review` outcome) is genuinely non-obvious and would be lost. Also, spec-contradicts-code and stuck-heuristic have no natural home in base CLAUDE.md.
- **Move spec-contradicts-code and stuck-heuristic into CLAUDE.md proper.** Rejected — they apply only in autonomous mode, so they'd need their own markers, regenerating the exact problem this spec removes. Their home is the playbook.
- **Rephrase the 12 rules in place to embed autonomous-mode behavior inline.** Rejected — 12 rule rewrites for a uniform transformation is worse than one umbrella rule. Also expands CLAUDE.md rather than shrinking it.

## Implementation steps

Execute in order. Each step is small and verifiable.

1. **Replace** the entire `## Autonomous mode overrides` section in `agent-config/docs/playbooks/ralph-v2-usage.md` — all current subsections — with the block from the "Rewritten playbook override section" subsection above.
2. **Append** the `## Autonomous-mode operational rules` section to the same playbook, immediately after the rewritten override section.
3. **Update** the `## Workflow modes` section in `agent-config/CLAUDE.md`: replace the existing marker-explaining paragraph with the new behavioral note per the "CLAUDE.md Workflow modes section update" subsection.
4. **Remove** the 12 ` (autonomous: see playbook)` suffixes from `agent-config/CLAUDE.md` per the audit table. Locate each by distinguishing substring; strip exactly the leading space + parenthesized phrase after the rule's terminating punctuation.
5. **Run verification** (see "Verification" below).
6. **Commit** in a single commit. Message: `docs: collapse autonomous-mode override structure to umbrella rule (ENG-NNN)`. Body summarizes: playbook override section rewritten, ops-rules section added, 12 CLAUDE.md markers removed, Workflow modes paragraph replaced.

## Verification

1. `grep -c "(autonomous: see playbook)" agent-config/CLAUDE.md` returns **0**. Both the 12 rule-suffix markers and the Workflow modes section's prose reference to the marker phrase are gone.
2. `grep -c "(autonomous: see playbook)" agent-config/docs/playbooks/ralph-v2-usage.md` returns **0**. The rewritten playbook text does not reference the marker phrase either.
3. `agent-config/docs/playbooks/ralph-v2-usage.md` contains exactly one `## Autonomous mode overrides` section and exactly one `## Autonomous-mode operational rules` section, in that order. `grep -c "^## " agent-config/docs/playbooks/ralph-v2-usage.md` returns **5** (Producing Approved issues, When to run `/ralph-start`, What to expect in the morning, Autonomous mode overrides, Autonomous-mode operational rules).
4. `grep -c "^### " agent-config/docs/playbooks/ralph-v2-usage.md` returns **0**. None of the old subsections (The escape hatch, Enumerated exit triggers, Default to exit on uncertainty, Per-rule mapping, Things that still apply) survive.
5. Manual readthrough of `agent-config/CLAUDE.md`: no rule ends with ` (autonomous: see playbook)`; the Workflow modes section's new behavioral note reads naturally between the bullet list and the `## Communication` heading.
6. Rule content unchanged: `git diff -- agent-config/CLAUDE.md` shows only deletions of ` (autonomous: see playbook)` suffixes plus the Workflow modes paragraph replacement — no other changes to rule text.
7. The Workflow modes section's playbook reference (`agent-config/docs/playbooks/ralph-v2-usage.md`) still resolves to an existing file at the expected path.

## Out of scope (follow-up work)

None anticipated. ENG-229 is canceled as part of this ticket's Linear finalization; no replacement ticket is planned.

## Open questions

None at spec time. All design questions were resolved during the spec dialogue.
