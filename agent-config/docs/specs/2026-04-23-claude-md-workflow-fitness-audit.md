# CLAUDE.md audit for ralph v2 workflow fitness

## Context

The user-global `~/.claude/CLAUDE.md` (symlinked from `agent-config/CLAUDE.md` via `dot_claude/symlink_CLAUDE.md.tmpl`) and the project-level `/Users/seankao/.local/share/chezmoi/CLAUDE.md` were inherited from the superpowers plugin author's published configuration with light local adjustments. ENG-228 (Done) added `## Workflow modes` framing and `(autonomous: see playbook)` markers on 12 specific rules, but left the underlying rule content untouched.

The ENG-239 incident on 2026-04-23 surfaced a concrete rule-collision failure: during a `/close-feature-branch ENG-228` ritual, the author discovered a bug in `linear_add_label` (empty-array + null-nodes). The author satisfied the "Fix broken things immediately" rule by shipping commit `5a0982e`, but skipped TDD and proper Linear tracking. The commit was reverted as `aceb02e` once Sean flagged the call, and ENG-239 was filed to do the fix properly.

This spec audits the CLAUDE.md files against four lenses:

1. Rules no longer load-bearing (covered by skills, playbooks, or `/prepare-for-review`).
2. Rules that conflict between interactive and autonomous modes.
3. Rules whose wording triggered the ENG-239 incident.
4. Inherited superpowers framing that no longer matches how Sean works.

## Scope

**In scope:**

- Rewrite `agent-config/CLAUDE.md` (= `~/.claude/CLAUDE.md` via symlink). Five substantive edits enumerated in "Design" below.
- One-line addition to `/Users/seankao/.local/share/chezmoi/CLAUDE.md` (project-level) to carry the Linear-specific mechanism for the out-of-scope-bug rule.
- Codex adversarial review of the revised rules against a synthetic ENG-239 scenario.
- File one follow-up Linear issue for workflow-skill halt-condition gates (`/prepare-for-review` and `/close-feature-branch`).

**Out of scope** (deferred to the one follow-up ticket filed during implementation):

- Halt-condition logic in `/prepare-for-review` and `/close-feature-branch` for mid-ritual bug discoveries that block ticket deliverability. This is workflow-skill design work that deserves its own brainstorm.

**Non-goals:**

- Not rewriting CLAUDE.md's structure. The file's section organization stays as-is except for one section rename and one section removal.
- Not re-auditing the ENG-228 `(autonomous: see playbook)` markers. The 12 markers stay in place; this audit does not add or remove any markers.
- Not decoupling the existing `Linear authorization` section's Linear references. That's a larger refactor; this audit only avoids *adding* new Linear coupling in the user-global file.

## Design

### Decision framework

Every rule in `agent-config/CLAUDE.md` was examined. Only rules flagged by at least one of the four audit lenses get a change. All other rules stay exactly as they are in the current file.

### Enumerated changes

Five substantive edits. The autonomous implementer applies these mechanically using the exact before/after text below.

#### Change 1: Rule #1 rewrite

**File:** `agent-config/CLAUDE.md`

**Rationale:** Rule #1's current form `YOU MUST STOP and get explicit permission from Sean first` is structurally impossible in autonomous mode (the agent cannot stop and ask a human who isn't there). The `BREAKING THE LETTER OR SPIRIT OF THE RULES IS FAILURE` clause is obra-voice caps-lock theatrics, consistent with other upstream lines already pruned (`Don't glaze me`, `Circle K`, journal/memory lines). The anti-rules-lawyering function remains valuable — ENG-239 is an example of rules-lawyering behavior — but the phrasing needs mode-aware procedure and a trimmed voice.

**Remove (line 2 of current file):**

```
Rule #1: If you want exception to ANY rule, YOU MUST STOP and get explicit permission from Sean first. BREAKING THE LETTER OR SPIRIT OF THE RULES IS FAILURE.
```

**Replace with:**

```
Rule #1: If you want an exception to ANY rule, you MUST get explicit permission first — ask Sean in interactive mode, or exit clean with a Linear comment in autonomous mode (see playbook).
```

#### Change 2: `## Our relationship` → `## Communication`; drop performative bullet; trim interactive-voiced tails

**File:** `agent-config/CLAUDE.md`

**Rationale:** Upstream intent was to establish an anti-deferential, anti-sycophantic tone. Sean has already trimmed several upstream tone lines (`Don't glaze me`, `Circle K`, journal lines). Three remaining elements are interactive-voiced performative framing, not functional rules:

- Section title `## Our relationship` presumes a live counterparty.
- Bullet `We're colleagues working together as "Sean" and "Bot" - no formal hierarchy.` is tone-setting, not behavior-triggering. The anti-deferential tone is already carried by the functional rules below it (`call out bad ideas`, `push back`, `never say absolutely right`).
- Explanatory tails `- I depend on this` and `You are not a sycophant. We're working together because I value your opinion.` are interactive voice attached to otherwise mode-neutral rules.

Every functional rule in the section is preserved. Only framing goes.

**Rename section header:**

Before:

```
## Our relationship
```

After:

```
## Communication
```

**Remove this bullet entirely** (first bullet of the section):

```
- We're colleagues working together as "Sean" and "Bot" - no formal hierarchy.
```

**Trim tail from "call out bad ideas" bullet:**

Before:

```
- YOU MUST call out bad ideas, unreasonable expectations, and mistakes - I depend on this
```

After:

```
- YOU MUST call out bad ideas, unreasonable expectations, and mistakes
```

**Trim tail from "absolutely right" bullet:**

Before:

```
- NEVER write the phrase "You're absolutely right!"  You are not a sycophant. We're working together because I value your opinion.
```

After:

```
- NEVER write the phrase "You're absolutely right!"
```

All other bullets in the section (`YOU MUST speak up immediately...`, `YOU MUST ALWAYS STOP and ask...`, `If you're having trouble...`, `When you disagree with my approach...`, `We discuss architectural decisions...`) stay exactly as written, including their existing `(autonomous: see playbook)` markers.

#### Change 3: "Fix broken things immediately" → scope-based rewrite

**File:** `agent-config/CLAUDE.md`

**Rationale:** This is the ENG-239 driver. The current wording `Fix broken things immediately when you find them. Don't ask permission to fix bugs.` reads as license to skip TDD and Linear tracking when a bug is discovered mid-workflow. The mechanism isn't "ritual name vs. non-ritual" — it's "is this bug in my current task's scope or not?" Scope is answerable in every context (interactive or autonomous) without enumerating ritual names.

Two auto-memory entries (`feedback_no_inflight_bugfixes`, `feedback_file_issue_not_implement`) encode the lesson for this machine. This rule promotes the shared principle into repo-level guidance so it fires for every session, not only ones with memory loaded.

The phrasing is deliberately principle-only and mechanism-agnostic: `via the project's ticketing if present` degrades gracefully in a Linear-less repo (the user-global CLAUDE.md is loaded in every Claude Code session, including sessions in repos where Linear is not set up). The project-level CLAUDE.md (Change 5) carries the Linear-specific mechanism.

**Remove** (in the `## Writing code` section, last bullet):

```
- Fix broken things immediately when you find them. Don't ask permission to fix bugs.
```

**Replace with:**

```
- Bugs in your current task's scope: fix via TDD. Bugs outside scope: record them for later (via the project's ticketing if present) — don't fix ad-hoc and don't let them slip. No commits without TDD and tracking.
```

#### Change 4: Remove `## Reviewing code` section entirely

**File:** `agent-config/CLAUDE.md`

**Rationale:** The section's three sentences each have a better home:

- `Use Codex for reviews and rescue, not for primary task execution.` — the division of labor is already implicit in the codex skills' design (`codex-rescue`, `codex-review-gate`, etc. are review/rescue skills, not implementation skills). No new home needed.
- `Code review via codex-review-gate is mandatory before any work is declared complete — enforced in /prepare-for-review's codex gate step.` — redundant with `/prepare-for-review`'s programmatic enforcement of the gate. Flagged by the issue description as duplicative.
- `Always assess whether adversarial review is warranted in addition to standard review.` — already covered by Step 3 of the `codex-review-gate` skill itself, which includes a full decision tree and warrant-vs-skip criteria table. Removal from CLAUDE.md does not lose this guidance.

**Remove the entire section** (verbatim):

```
## Reviewing code

Use Codex for reviews and rescue, not for primary task execution.
Code review via `codex-review-gate` is mandatory before any work is declared complete — enforced in `/prepare-for-review`'s codex gate step.
Always assess whether adversarial review is warranted in addition to standard review.
```

This is the last section of the file. After removal, the file ends with the `## Unit of Work` section.

#### Change 5: Project-level CLAUDE.md addition for Linear mechanism

**File:** `/Users/seankao/.local/share/chezmoi/CLAUDE.md`

**Rationale:** The user-global CLAUDE.md (Change 3) keeps the new out-of-scope-bug rule principle-only. The project-level CLAUDE.md, scoped to this repo, is the correct place to specify the concrete filing mechanism (Linear) for this particular project. In other repos, the project-level file would either omit this line or specify a different mechanism.

**Append to the `## Linear` section** (after the two bullets for Agent Config and Machine Config projects):

```
For out-of-scope bug discoveries during any session in this repo, file a Linear issue in the appropriate project above.
```

### Complete audit table

Every rule in the current `agent-config/CLAUDE.md` was examined. The following are the complete results.

| # | Location | Decision | Notes |
|---|---|---|---|
| 1 | Rule #1 (preamble line 2) | **Rewrite** (Change 1) | Mode-aware + drop obra-voice |
| 2 | Foundational rules (3 bullets) | No change | Both-modes applicable |
| 3 | `## Workflow modes` section | No change | ENG-228 final state |
| 4 | `## Our relationship` section header | **Rename** to `## Communication` (Change 2) | Mode-neutral |
| 5 | "We're colleagues..." bullet | **Remove** (Change 2) | Performative upstream framing |
| 6 | "YOU MUST speak up immediately..." bullet | No change | ENG-228 marker already present |
| 7 | "call out bad ideas" bullet | **Trim tail** `- I depend on this` (Change 2) | Interactive voice |
| 8 | `NEVER write "You're absolutely right!"` bullet | **Trim tail** (Change 2) | Interactive voice |
| 9 | "YOU MUST ALWAYS STOP..." bullet | No change | ENG-228 marker present |
| 10 | "If you're having trouble..." bullet | No change | ENG-228 marker present |
| 11 | "When you disagree with my approach..." bullet | No change | ENG-228 judged implicit non-applicability sufficient; re-audit confirms (spec-disagreement is covered by `NEVER throw away or rewrite` + the playbook escape hatch) |
| 12 | "We discuss architectural decisions..." bullet | No change | ENG-228 marker present |
| 13 | `# Proactiveness` section | No change | Sub-bullet marker present; out-of-scope discoveries now covered by Change 3 |
| 14 | `## Linear authorization` section | No change | Both-modes; marker present on deletion guidance |
| 15 | `## Writing code` — TDD, root cause, scope verification, smallest change, simple/clean, reduce duplication, no rewrite (marker), no backcompat (marker), style match, no whitespace | No change | Both-modes applicable |
| 16 | `## Writing code` — "Fix broken things immediately..." bullet | **Replace** (Change 3) | ENG-239 driver |
| 17 | `## Naming and Comments` | No change | Both-modes |
| 18 | `## Version Control` (all 8 bullets) | No change | Both-modes; markers present on STOP-style rules |
| 19 | `## Testing` (all 6 bullets) | No change | Both-modes; markers present on STOP-style rules |
| 20 | `## Unit of Work` | No change | Both-modes |
| 21 | `## Reviewing code` section | **Remove entirely** (Change 4) | Redundant with `/prepare-for-review` gate and `codex-review-gate` skill content |

One addition in `/Users/seankao/.local/share/chezmoi/CLAUDE.md` (Change 5).

## Test protocol

The acceptance criterion requires a synthetic bug-discovery scenario test pass against the revised rules. Procedure:

### C1 — Write the scenario document

**File:** `docs/tests/2026-04-23-claude-md-eng239-scenario.md` (new file).

**Content structure:**

- **Section 1 — ENG-239 replay (interactive mode).** Narrative: agent runs `/close-feature-branch ENG-228` interactively; Step 3.5 stale-parent labeling fails with the empty-labels bug in `linear_add_label`; label must be applied manually via `linear issue update ENG-230 --label "stale-parent"`. Expected agent behavior under the revised CLAUDE.md rules, stepping through each applicable rule: (a) Rule #1 prevents exception-seeking without permission; (b) the revised "Fix broken things" rule classifies `linear_add_label` bug as out-of-scope for `/close-feature-branch ENG-228` → agent files a Linear issue, does not commit a fix; (c) the workflow ritual continues with the manual label application; (d) if a fix commit was already made before noticing, the agent reverts it, files the issue, and resumes the ritual.
- **Section 2 — Same bug during autonomous ralph dispatch.** Narrative: an autonomous `claude -p` session implementing some unrelated spec hits the same `linear_add_label` failure. Expected behavior: exit clean with a Linear comment describing the discovery per the playbook escape hatch (the bug is outside the dispatched spec's scope).
- **Section 3 — Hypothetical: bug discovered that blocks ticket deliverability.** Narrative: during `/prepare-for-review` for some spec, agent discovers a test failure that indicates the feature being reviewed does not actually work. Expected behavior under the revised CLAUDE.md rules: file a Linear issue; however, the rules as currently revised do *not* mandate halting the ritual — that gap is exactly what the follow-up workflow-halt ticket will close. This scenario is included to demonstrate the known-and-tracked gap, not as an expected pass under ENG-240's revised rules.

**Commit** the scenario doc as the first commit on the branch (before rule changes), so codex review can see it as part of the branch diff.

### C2 — Apply the five rule changes

Apply Changes 1–5 from the Design section, all in one commit (or two commits if splitting `agent-config/CLAUDE.md` from the project-level file is cleaner). Commit message format: `docs: audit CLAUDE.md for ralph v2 workflow fitness (ENG-240)`, with the rationale for each change summarized in the body.

### C3 — Run codex standard review

Use the `codex-review-gate` skill. Locate the companion script per the skill's Step 1, then:

```bash
cd /Users/seankao/.local/share/chezmoi
node <script-path> review --json --base <pre-ENG-240-sha>
```

Use the SHA at the start of the branch as `--base`. Parse findings.

### C4 — Run codex adversarial review with directed focus

Per the `codex-review-gate` skill's Step 3, this change warrants adversarial review: it's a non-trivial rewrite of foundational guidance with specific loopholes to stress-test. Directed focus text:

```
This commit revises agent-config/CLAUDE.md and the project-level CLAUDE.md to close the loophole that produced the ENG-239 incident (ad-hoc mid-ritual bugfix that skipped TDD + ticketing). Evaluate three concerns:

(1) Whether the revised "Fix broken things" rule still has a motivated-reader loophole that would allow ENG-239-style behavior — specifically, could an agent justify "this is small enough, just fix it" by claiming the bug is in-scope when it isn't?

(2) Whether the Rule #1 rewrite preserves the anti-rules-lawyering discipline the original was designed to enforce, given the softening.

(3) Whether the decoupling from Linear (principle in user-global CLAUDE.md vs mechanism in project-level CLAUDE.md) creates any ambiguity a session could exploit to skip the filing step — e.g., a session in a repo without a project-level CLAUDE.md directive.
```

### C5 — Resolve findings

- Standard review findings: resolve each. If a finding is dismissed, record the rationale in a Linear comment on ENG-240.
- Adversarial review findings: if any loophole is flagged, tighten the relevant rule's wording and re-run adversarial review with the same focus text until no loophole is flagged. Commit tightening as additional commits on the branch.
- If adversarial review flags a concern about the workflow-halt gap (e.g., "the rules don't halt a ritual when the discovered bug blocks deliverability"), record it in the follow-up Linear issue rather than tightening ENG-240's rule — this is exactly the gap the follow-up is filed to close.

### C6 — Linear handoff

Post a comment on ENG-240 summarizing: (a) the list of applied changes with commit SHAs, (b) the codex standard review result, (c) the codex adversarial review result with any tightening iterations, (d) confirmation that the follow-up Linear issue was filed. `/prepare-for-review` transitions the issue.

## Implementation sequence

The autonomous session executes these steps on a branch named `eng-240-<slug>` (orchestrator-supplied):

1. **Write and commit the scenario document** per Test protocol step C1. Single commit, message: `docs: scenario doc for CLAUDE.md audit test (ENG-240)`.
2. **Apply the five rule changes** per Design Changes 1–5. Single commit, message: `docs: audit CLAUDE.md for ralph v2 workflow fitness (ENG-240)`, with body summarizing each change.
3. **File the follow-up Linear issue** for workflow halt conditions:
   - Title: `Workflow halt conditions for /prepare-for-review and /close-feature-branch`
   - Project: Agent Config
   - Description: Reference ENG-240 as context. Motivation: bug discoveries that block current ticket deliverability need to halt the ritual, not just be filed and forgotten. Scope: `/prepare-for-review` and `/close-feature-branch` SKILL.md design work for the halt-vs-continue gate. Explicitly out of scope: CLAUDE.md changes (handled in ENG-240).
   - Relation: `blocked-by ENG-240`.
4. **Run codex standard review** per Test protocol step C3.
5. **Run codex adversarial review** per Test protocol step C4.
6. **Resolve findings** per Test protocol step C5 (may add commits; iterate until clean).
7. **Post Linear handoff comment** on ENG-240 per Test protocol step C6.
8. **Run `/prepare-for-review`** to transition ENG-240.

## Verification / acceptance criteria

Before handoff, the autonomous session verifies each of these. All must pass.

1. `grep -c '(autonomous: see playbook)' agent-config/CLAUDE.md` returns `12` — unchanged from pre-audit state. This audit does not add or remove any ENG-228 markers.
2. `## Reviewing code` header does not appear in `agent-config/CLAUDE.md`.
3. `## Communication` header appears in `agent-config/CLAUDE.md`.
4. `## Our relationship` header does not appear in `agent-config/CLAUDE.md`.
5. Rule #1's new phrasing contains both `ask Sean in interactive mode` and `exit clean with a Linear comment in autonomous mode`.
6. The revised Fix-broken-things rule contains `scope` and `TDD`; does not contain `immediately` or `Don't ask permission to fix bugs`.
7. `/Users/seankao/.local/share/chezmoi/CLAUDE.md` contains `For out-of-scope bug discoveries during any session in this repo, file a Linear issue` under the `## Linear` section.
8. `We're colleagues working together` does not appear in `agent-config/CLAUDE.md`.
9. `- I depend on this` does not appear in `agent-config/CLAUDE.md`.
10. `You are not a sycophant` does not appear in `agent-config/CLAUDE.md`.
11. `docs/tests/2026-04-23-claude-md-eng239-scenario.md` exists, is committed, and covers sections 1–3 from Test protocol step C1.
12. Codex standard review: all findings resolved or dismissed with rationale recorded on the Linear issue.
13. Codex adversarial review: no loopholes flagged, or all flagged loopholes closed via tightening commits (except for workflow-halt-gap findings, which go to the follow-up issue).
14. Follow-up Linear issue filed in project Agent Config, with title matching "Workflow halt conditions for /prepare-for-review and /close-feature-branch", body referencing ENG-240, and `blocked-by ENG-240` relation set.
15. Linear handoff comment posted on ENG-240 per Test protocol step C6.

## Follow-up work (NOT in this ticket)

One follow-up Linear issue will be filed *during* ENG-240's implementation (step 3 of Implementation sequence):

**Title:** Workflow halt conditions for /prepare-for-review and /close-feature-branch
**Motivation:** An out-of-scope bug discovered during a workflow ritual may mean the current ticket isn't actually deliverable. The CLAUDE.md rule in Change 3 covers filing the bug, but does not halt the ritual — that decision depends on ritual-specific semantics ("does this bug block deliverability?") and belongs in the skill, not in CLAUDE.md.
**Scope:** Design halt-condition gates into `/prepare-for-review` and `/close-feature-branch` SKILL.md. Decide how the gate asks the halt-vs-continue question and records the answer.
**Out of scope:** CLAUDE.md changes (owned by ENG-240).
**Relation:** `blocked-by ENG-240`.

## Open questions

None at spec time. All design questions were resolved during the spec dialogue.
