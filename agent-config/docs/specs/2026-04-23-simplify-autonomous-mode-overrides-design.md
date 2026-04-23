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

This spec collapses the three-layer framing into a single behavioral rule, preserves the two genuinely-new operational rules (spec-contradicts-code, stuck-heuristic) in a dedicated `## Autonomous mode` section of `agent-config/CLAUDE.md`, and removes the 12 pointer markers. Net effect: the override mechanism is documented once, not twelve times, and autonomous-mode agent rules live in the file every autonomous session already loads.

## Scope

**In scope:**

- Add a new `## Autonomous mode` section to `agent-config/CLAUDE.md` with two subsections: **Overrides** (umbrella behavioral rule + mechanism + default-to-exit clause + carve-outs) and **Operational rules (no interactive counterpart)** (spec-contradicts-code, stuck-heuristic).
- Remove all 12 `(autonomous: see playbook)` suffixes from `agent-config/CLAUDE.md` per the audit table in the Design section.
- Replace the `## Workflow modes` section's marker-explaining note in `agent-config/CLAUDE.md` with a clean end-user pointer to the playbook (ralph operations only) — the autonomous-mode behavior moves to its own section rather than riding along inside Workflow modes.
- Remove the `## Autonomous mode overrides` and `## Autonomous-mode operational rules` sections from `agent-config/docs/playbooks/ralph-v2-usage.md`. Autonomous-mode agent rules do not belong in an end-user playbook.
- Expand the umbrella's verb coverage to enumerate escalation verbs (`STOP and ask`, `speak up`, `call out`, `push back`, `raise the issue`) and gating requirements (confirmation, approval, permission, discussion) explicitly, so a literal-reading agent cannot miss a rule whose escalation phrasing doesn't literally contain "STOP and ask Sean". Surfaced by the codex adversarial review pass on the first revision.
- Drop the mocked-behavior test rule (`YOU MUST NEVER write tests that "test" mocked behavior. If you notice tests that test mocked behavior instead of real logic, you MUST stop and warn Sean about them.`) from the `## Testing` section. Its prior "comment and continue" graceful path is lost under the umbrella, and Sean's judgment is that test-writing choices don't belong as a universal rule — the implementer makes the call on what to test. Surfaced by the same codex review pass.

**Out of scope:**

- Changes to `/ralph-spec`, `/ralph-start`, `/ralph-implement`, or `agent-config/superpowers-overrides/subagent-driven-development`.
- Changes to the mechanism semantics (escape-hatch behavior, `exit_clean_no_review` outcome, comment-then-exit-clean pattern) — same mechanism, different packaging.
- Rewording any existing CLAUDE.md rule content beyond removing the marker suffix, rewriting the Workflow modes section's marker-note paragraph, and adding the new `## Autonomous mode` section.
- Updating `/Users/seankao/.claude/CLAUDE.md` directly — chezmoi propagates from `agent-config/CLAUDE.md`.
- ENG-229 implementation. That ticket is canceled as part of this ticket's Linear finalization (not as a deliverable of this spec's implementation).

**Non-goals:**

- Not expanding overall footprint. Autonomous-mode content is relocated from the playbook into a new CLAUDE.md section; net line count across CLAUDE.md + playbook should be approximately neutral.
- Not enumerating more edge cases. If the single umbrella rule + default-to-exit don't cover a situation, exit clean.

## Design

### Approach choice (CLAUDE.md markers)

Three shapes were considered; option **B** was chosen.

- **A — Keep the 12 inline markers, simplify the playbook only.** Rejected: every marker points to the same umbrella rule, so per-rule pointers add noise without disambiguation value. Readers reading CLAUDE.md top-to-bottom would encounter 12 footnotes that all resolve to the same answer.
- **B — Remove all 12 markers; document the autonomous-mode behavior in a dedicated `## Autonomous mode` section in `agent-config/CLAUDE.md`. (Chosen.)** Single source of truth. Each CLAUDE.md rule reads normally without suffixes. The umbrella behavior is stated once, in the file every autonomous session already loads, rather than scattered across 12 per-rule pointers into an end-user playbook.
- **C — Hybrid: keep markers on a "high-value" subset.** Rejected: no principled line between high-value and low-value when the mapped behavior is uniform. Inevitably drifts toward A or B under maintenance pressure.

### Playbook trim

Remove the full `## Autonomous mode overrides` section (all current subsections: "The escape hatch", "Enumerated exit triggers", "Default to exit on uncertainty", "Per-rule mapping", "Things that still apply") and the `## Autonomous-mode operational rules` section from `agent-config/docs/playbooks/ralph-v2-usage.md`. No replacement content — the playbook's remaining sections ("Producing Approved issues", "When to run `/ralph-start`", "What to expect in the morning") are end-user-oriented and that's the whole file's intended audience.

### New CLAUDE.md Autonomous mode section

Insert a new top-level `## Autonomous mode` section in `agent-config/CLAUDE.md` immediately after `## Workflow modes` (and before `## Communication`):

```markdown
## Autonomous mode

Most rules in this file apply in both modes. Two exceptions follow.

### Overrides

In autonomous mode, every rule in this file that requires input from Sean — whether phrased as an escalation ("STOP and ask", "speak up", "call out", "push back", "raise the issue") or a gating requirement (confirmation, approval, permission, discussion) — instead becomes: **post a Linear comment on the issue you're implementing describing what's blocking, then exit clean (no PR, no In Review transition).** The orchestrator records this as `exit_clean_no_review` in `progress.json`; Sean triages on the next pass. Default to that behavior on any decision you can't confidently classify as routine — wasted overnight cycles are cheaper than wrong-direction overnight cycles.

Linear authorization (edit descriptions, comment, change state, manage labels, file new issues, set relations on the dispatched issue and judged-relevant issues) applies fully — the escape hatch leans on this. Codex usage (codex-rescue, codex-review-gate) applies fully — `/prepare-for-review`'s codex gate runs from the autonomous session. Deleting issues or comments is not permitted in autonomous mode.

### Operational rules (no interactive counterpart)

- **Spec contradicts the code.** If the spec describes a state of the world that doesn't match the codebase in a way you can't reconcile — a file the spec says to edit doesn't exist, a function it references has a different signature, a prerequisite it assumes is missing — treat that as a spec bug, not an implementation puzzle. Post a comment and exit clean.
- **Stuck.** If the same operation has been tried 3 times without progress, or ≥30 minutes of compute has been spent on the same subgoal without convergence, post a comment and exit clean. Fresh context is cheaper than compounding a confused approach.
```

### CLAUDE.md Workflow modes section update

In `agent-config/CLAUDE.md`'s `## Workflow modes` section, replace the existing two-line paragraph:

```markdown
Most rules below apply in both modes. Rules that need autonomous-mode-specific
behavior are marked `(autonomous: see playbook)`.
```

with a pointer to the playbook that is scoped purely to ralph operations (end-user content) — the autonomous-mode rule material is no longer mixed into this section:

```markdown
For ralph operations (when to run `/ralph-start`, what `progress.json` outcomes
mean, triaging failed sessions), see `agent-config/docs/playbooks/ralph-v2-usage.md`.
```

(The playbook pointer already existed in the section — the edit is removing the marker-explaining paragraph; the autonomous-mode rules now live in their own `## Autonomous mode` section below.)

### CLAUDE.md marker removal (audit table)

Remove the trailing ` (autonomous: see playbook)` suffix from each of the 11 rules below. Locate by distinguishing substring — line numbers will shift after the Workflow modes paragraph is rewritten, so don't rely on them. In every case the suffix is *a leading space, followed by the parenthesized phrase, placed after the rule's terminating punctuation* — remove exactly that range. (A twelfth rule in the Testing section — the mocked-behavior rule that previously carried this marker — is dropped entirely per Scope, so no marker-removal is needed there.)

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

## Alternatives considered (rejected)

- **Keep the full ENG-228 three-layer structure.** Rejected per Context — the framing is more machinery than the concept warrants, and Layer 1 mostly restates rules already in CLAUDE.md.
- **Ship ENG-229 as originally scoped.** Rejected — the "Reserved for human review" list duplicates decisions specs should make directly; the "Implementer decides" list was a Layer-3 relaxation that doesn't survive Layer 3's collapse.
- **Delete the overrides section entirely.** Rejected — the escape-hatch *mechanism* (what comment to post, `exit_clean_no_review` outcome) is genuinely non-obvious and would be lost. Also, spec-contradicts-code and stuck-heuristic need a durable home.
- **Keep spec-contradicts-code, stuck-heuristic, and the escape-hatch mechanism in the playbook** (the original choice in the first revision of this spec). Rejected on reflection — `ralph-v2-usage.md` is an end-user playbook (its own intro line says so), read by Sean at the desk for orchestrator triage. Autonomous-mode *agent* rules don't belong there; they belong in the file every autonomous session actually loads. The original rejection of "move into CLAUDE.md proper" assumed inline markers would regenerate; placing the content in a dedicated `## Autonomous mode` section (not inline with existing rules) avoids that entirely.
- **Rephrase the 12 rules in place to embed autonomous-mode behavior inline.** Rejected — 12 rule rewrites for a uniform transformation is worse than one umbrella rule. Also expands CLAUDE.md rather than shrinking it.

## Implementation steps

Execute in order. Each step is small and verifiable.

1. **Remove** the `## Autonomous mode overrides` section (all subsections) and the `## Autonomous-mode operational rules` section from `agent-config/docs/playbooks/ralph-v2-usage.md`. Leave nothing in their place — the file's remaining sections are end-user-oriented and that is the entire audience.
2. **Insert** the new `## Autonomous mode` section into `agent-config/CLAUDE.md` immediately after `## Workflow modes`, per the "New CLAUDE.md Autonomous mode section" subsection above.
3. **Update** the `## Workflow modes` section in `agent-config/CLAUDE.md`: remove the marker-explaining paragraph and leave the playbook pointer scoped to ralph operations only, per the "CLAUDE.md Workflow modes section update" subsection.
4. **Remove** the 11 ` (autonomous: see playbook)` suffixes from `agent-config/CLAUDE.md` per the audit table. Locate each by distinguishing substring; strip exactly the leading space + parenthesized phrase after the rule's terminating punctuation.
5. **Drop** the mocked-behavior rule bullet (`YOU MUST NEVER write tests that "test" mocked behavior. If you notice tests that test mocked behavior instead of real logic, you MUST stop and warn Sean about them.`) from the `## Testing` section of `agent-config/CLAUDE.md` entirely. This was originally the 12th marker-carrying rule; dropping the whole rule subsumes removing its marker.
6. **Run verification** (see "Verification" below).
7. **Commit** in a single commit. Message: `docs: collapse autonomous-mode override structure to umbrella rule (ENG-NNN)`. Body summarizes: playbook autonomous-mode sections removed, new `## Autonomous mode` section added to CLAUDE.md, 11 CLAUDE.md markers removed, mocked-behavior rule dropped, umbrella verb coverage expanded, Workflow modes paragraph replaced.

## Verification

1. `grep -c "(autonomous: see playbook)" agent-config/CLAUDE.md` returns **0**. The 11 rule-suffix markers and the Workflow modes section's prose reference to the marker phrase are gone (the 12th rule is dropped entirely, so it has no marker to remove).
2. `grep -c "(autonomous: see playbook)" agent-config/docs/playbooks/ralph-v2-usage.md` returns **0**. The playbook contains no remaining autonomous-mode prose that could reference the marker phrase.
3. `agent-config/docs/playbooks/ralph-v2-usage.md` contains exactly three `## ` headings: Producing Approved issues, When to run `/ralph-start`, What to expect in the morning. `grep -c "^## " agent-config/docs/playbooks/ralph-v2-usage.md` returns **3**. `grep -c "^### " agent-config/docs/playbooks/ralph-v2-usage.md` returns **0**.
4. `agent-config/CLAUDE.md` contains exactly one `## Autonomous mode` section, with two `### ` subsections (`### Overrides`, `### Operational rules (no interactive counterpart)`).
5. `grep -c "mocked behavior" agent-config/CLAUDE.md` returns **0**. The mocked-behavior test rule is gone.
6. Manual readthrough of `agent-config/CLAUDE.md`: no rule ends with ` (autonomous: see playbook)`; the Workflow modes section ends cleanly with the playbook pointer; the new `## Autonomous mode` section reads naturally between `## Workflow modes` and `## Communication`; the Testing section contains 5 bullets (mocked-behavior dropped).
7. Rule content unchanged outside the scoped edits: `git diff -- agent-config/CLAUDE.md` shows only deletions of ` (autonomous: see playbook)` suffixes, the Workflow modes paragraph replacement, the new `## Autonomous mode` section addition, and the mocked-behavior rule deletion — no other changes to rule text.
8. The Workflow modes section's playbook reference (`agent-config/docs/playbooks/ralph-v2-usage.md`) still resolves to an existing file at the expected path.

## Out of scope (follow-up work)

None anticipated. ENG-229 is canceled as part of this ticket's Linear finalization; no replacement ticket is planned.

## Open questions

None at spec time. All design questions were resolved during the spec dialogue.
