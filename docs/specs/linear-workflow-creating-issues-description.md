# linear-workflow: add Description to Creating Issues checklist

**Linear:** ENG-311
**Date:** 2026-04-28

## Goal

Close the gap that lets autonomous agents file Linear issues with `description: null`.
Add a Description requirement to the `## Creating Issues` checklist in
`agent-config/skills/linear-workflow/SKILL.md`, and surface
description-omission as a named failure mode in `## Autonomous Sessions`.

## Background

`agent-config/skills/linear-workflow/SKILL.md` enumerates the fields to
confirm when proposing a new issue under `## Creating Issues`. The current
list — Title, Project, Priority, Labels, Assignee, Status, Dependencies,
Follow-ups — does **not** include Description. An autonomous agent
following the skill literally has no instruction to write one, and the
`## Autonomous Sessions` section compounds the gap by pointing back at
the same defective checklist:

> Entry Point 2 (filing follow-ups) proceeds without confirmation.
> Use the defaults in "Creating Issues" below…

### Incident

During `/prepare-for-review` for ENG-279 on 2026-04-28, the autonomous
session filed two follow-ups derived from codex review findings:
ENG-309 ("preserve original base-sha on retry") and ENG-310
("canonicalize paths in `worktree_branch_state_for_issue`"). Both were
created with `description: null`, no estimate, and no `related`/`blocked-by`
relation back to ENG-279. The only context lived in the ENG-279 handoff
comment — once that scrolls past, the follow-ups are effectively
title-only TODOs.

The descriptions were backfilled by hand on 2026-04-28 (during the
`/sr-spec` exploration for this issue, both already carried full
descriptions). The skill content is the durable fix.

### Why this matters more in autonomous mode

In interactive use, the operator usually proposes an issue verbally with
full context and approves the create — the model has rich material to
draft a description from, and the operator notices an empty body. In
autonomous mode (`/sr-start`, ralph dispatches), the operator sees the
issue hours or days later, with the originating session long gone. A
title-only follow-up at that point is unactionable without re-reading
transcripts that may not exist.

## Scope

One file modified: `agent-config/skills/linear-workflow/SKILL.md`. Two edits.

Anchors are **content-based** (heading and bullet identity), not line
numbers. ENG-275 (`blocked-by`, see "Prerequisites" below) inserts a new
top-level subsection earlier in the file before this issue dispatches,
so any line-number reference would be stale by then.

The `digraph linear_flow` diagram at the top of the file is unchanged —
it depicts skill *activation* points, not field checklists. No other
files are touched (`CLAUDE.md` autonomous-mode overrides, the
`linear-cli` plugin skill, and `sensible-ralph` plugin docs are all
unrelated to the field-checklist gap under edit).

### Edit 1 — Insert a Description bullet after the Title bullet in `## Creating Issues`

The `## Creating Issues` checklist begins (after the section heading and
the lead-in sentence "When proposing a new issue, confirm these with the
user:") with the **Title** bullet, then **Project**. Insert the new
bullet between them, so the checklist reads Title → Description →
Project → … in that order.

Verbatim text of the new bullet:

```markdown
- **Description**: Substantive enough that the issue is actionable without reading the originating context. At minimum: (a) the problem in 1–3 sentences, (b) impact / when it triggers, (c) fix direction or the constraint blocking an obvious fix. When the originating context includes concrete code evidence, include the relevant file paths and code excerpts directly; for behavior-only or planning issues without code context, describe the observation precisely and skip the path/snippet expectation. For follow-ups discovered during active work on another issue — codex review, implementation, code review, or testing — prefix the description with the provenance sentence `**Discovered during <issue-id> <discovery-phase>.**` (where `<discovery-phase>` is one of those four phases). For scope-cut follow-ups (work deliberately deferred from a parent issue's plan), use the alternate prefix `**Scoped out of <issue-id>'s plan.**`. In either case, optionally follow with a one-sentence rationale for filing separately when one applies — e.g. `Filed as a follow-up because the fix is outside <issue-id>'s spec scope.` or `Filed separately for risk containment.` — but the provenance sentence alone is sufficient. The parent-issue relation set per the **Follow-ups** bullet provides additional provenance, but the description prefix carries enough alone to keep the follow-up actionable if the relation is missed. Use `--description-file <path>` rather than `--description <string>` for any markdown content with code blocks or backticks.
```

Rationale for placement: descriptions are the next field a creator
confronts after the title, so they belong second in the checklist for
parallel structure with the user-facing creation flow. Inserting at the
top (above Title) would obscure the imperative-verb title convention
that the existing bullet's good/bad examples teach. Inserting at the
bottom would put a load-bearing requirement after housekeeping fields
(Labels, Assignee) where it's easier to skip.

Rationale for the two prefix templates: the four active-phase contexts
(codex review, implementation, code review, testing) read naturally as
"Discovered during X". Scope-cut is a one-time event rather than a
phase, so it gets its own template (`**Scoped out of <issue-id>'s
plan.**`). Both templates are textual provenance carried in the issue
body, so every follow-up class — phase-discovered and scope-cut alike
— is actionable from the description alone. An earlier draft made
scope-cut prefix-exempt and relied on the parent-issue relation as
provenance, but the same incident producing this spec (ENG-309/ENG-310)
also missed the relation step, so leaning on the relation as the sole
provenance carrier reproduces the failure mode this issue is trying to
fix.

Rationale for the optional rationale tail: an earlier draft hardcoded
`Filed as a follow-up because the fix is outside <issue-id>'s spec
scope.` as a required second sentence. Not every follow-up is filed
for that reason — risk containment, ownership boundaries, and
deliberate deferral within scope are all valid causes. Demanding the
verbatim rationale would pressure the agent to emit a false statement.
The provenance sentence alone is the load-bearing piece; the rationale
tail is a useful affordance, not a requirement.

Rationale for the code-evidence conditional: the rule is in the
general `## Creating Issues` checklist, which governs all issue
creation — not just follow-ups from active code work. Net-new
features, planning issues, and behavior-only bug reports often have no
concrete file path or snippet to cite. Making path/snippet inclusion
unconditional would either pressure the agent into fabricating
references or get silently downgraded; gating on "concrete code
evidence" is the smaller, more honest rule.

### Edit 2 — Append a description-omission callout to Entry Point 2 in `## Autonomous Sessions`

The `## Autonomous Sessions` section's second bullet currently reads
(beginning of bullet shown for anchor; ending sentence shown verbatim
for the append point):

> - **Entry Point 2 (filing follow-ups) proceeds without confirmation.**
>   Use the defaults in "Creating Issues" below: project per workspace
>   context, priority Urgent for bugs / Medium for features, status
>   `Backlog` when scope is vague or `Todo` when actionable. Always link
>   back to the originating issue via `linear issue relation add` so
>   provenance is preserved for later human review.

Append (no new bullet, no blank line — the new sentences extend the
existing paragraph so the whole bullet still reads as one Entry Point 2
block):

```markdown
**Description omission is the most common autonomous-mode failure mode.** A title-only follow-up is unactionable hours later — the originating session and its transcripts may be gone. Apply the Description requirements from "Creating Issues" verbatim; do not file with an empty body. **If you cannot fill the (a)/(b)/(c) minimum from current evidence**, do not fabricate content to satisfy the checklist — instead, leave a comment on the originating issue describing what you observed and the missing context, and defer the new-issue creation to human review of the originating handoff. Inventing a plausible but speculative description is worse than not filing.
```

Rationale: cross-references get skipped under autonomous load. The
existing "Use the defaults in 'Creating Issues' below" sentence is
exactly the prose that's been getting read past. Adding the explicit
failure-mode callout next to that reference catches readers who treat
the cross-reference as ambient.

## Prerequisites

* `blocked-by ENG-275` — Approved, edits the same file
  (`agent-config/skills/linear-workflow/SKILL.md`) but in different
  sections (`## Integration with Superpowers Workflow` boundary, Entry
  Point 1's branch list, and the first bullet of `## Autonomous
  Sessions`). The two issues are logically independent but textually
  adjacent; serializing them via `blocked-by` avoids rebase friction
  during autonomous dispatch. ENG-311 will dispatch only after ENG-275
  reaches `In Review` or `Done` (per `/sr-start`'s blocker preflight,
  which treats both as resolved).

## Out of scope

Two related skill-followthrough misses surfaced in the same incident
but they are agent-discipline issues, not skill-content gaps. Listing
for future reference, not as part of this fix:

* **Relation back to originating issue was skipped** for ENG-309/ENG-310.
  The rule already exists in the **Follow-ups** bullet of `## Creating
  Issues`. If the skip recurs frequently after this fix lands, file a
  separate issue.
* **Estimate was missing** for ENG-309/ENG-310. The estimate-required
  rule lives in `sensible-ralph/CLAUDE.md`, not this skill, so it is
  not in `linear-workflow`'s editable surface.

Adding more rules to a checklist that the agent already partially
ignored has diminishing returns; one well-placed bullet plus an
autonomous-context callout is the right size for this fix.

## Acceptance criteria

- [ ] `agent-config/skills/linear-workflow/SKILL.md` `## Creating Issues`
      checklist contains a new bullet titled `**Description**`,
      positioned **after** the **Title** bullet and **before** the
      **Project** bullet.
- [ ] That bullet covers all five content requirements named in
      "Verbatim text of the new bullet" above: (a)/(b)/(c) minimum
      content; conditional file-paths-and-code-snippets gated on
      concrete code evidence; the active-phase provenance-prefix
      template with its four-phase menu (codex review, implementation,
      code review, testing); the scope-cut alternate prefix
      (`**Scoped out of <issue-id>'s plan.**`); and the
      `--description-file` preference for markdown content with
      backticks.
- [ ] `## Autonomous Sessions` Entry Point 2 bullet ends with the
      five-sentence callout from Edit 2 above, appended to the
      existing bullet (no new bullet, no blank line — same paragraph).
      The callout includes the insufficient-evidence fallback
      (comment-on-parent-and-defer rather than fabricate or skip).
- [ ] This issue's two edits to
      `agent-config/skills/linear-workflow/SKILL.md` are purely
      additive: a new Description bullet within `## Creating Issues`
      and an appended sentence trio inside the existing Entry Point 2
      bullet of `## Autonomous Sessions`. No pre-existing line in the
      file is modified or removed by this issue's diff. The diff
      baseline is the file as it exists at dispatch time (post-ENG-275,
      since this issue is `blocked-by ENG-275`); the byte-additive
      constraint is enforced by the `git diff` check in Verification
      step 4, not by comparison against any older snapshot.
- [ ] A reader of the `## Creating Issues` checklist can answer "what
      should the description contain?" from the bullet alone, without
      needing to consult the originating session, the `linear-cli`
      plugin docs, or another skill.

## Verification

The autonomous implementer should run all of the following after the
edits land. Each is a fast mechanical check.

1. `grep -n '\*\*Description\*\*:' agent-config/skills/linear-workflow/SKILL.md`
   returns exactly one match. The match's line number is **after** the
   `**Title**` bullet's line number and **before** the `**Project**`
   bullet's line number, both within `## Creating Issues`.
2. `grep -n 'Description omission is the most common' agent-config/skills/linear-workflow/SKILL.md`
   returns exactly one match, inside `## Autonomous Sessions`.
3. `grep -n -- '--description-file' agent-config/skills/linear-workflow/SKILL.md`
   returns at least one match, inside the new Description bullet.
4. `git diff agent-config/skills/linear-workflow/SKILL.md` shows
   **only** additions (no deletions, no edits to existing lines)
   except for the insertion-point context lines git naturally shows
   around the inserts. If any pre-existing line is modified, the diff
   has drifted from spec — abort and re-do.
5. Read the changed file end-to-end. Confirm the new content reads
   naturally in the surrounding prose (no orphan headings, no broken
   markdown lists, no doubled blank lines, no markdown that fails to
   render in Linear's markdown subset — Linear renders backticks,
   bold, and lists faithfully).

## Testing expectations

No new automated tests. All changes are markdown prose in a skill
file. Validation is the verification suite above plus the codex
review at `/prepare-for-review`, which catches edit drift on markdown.

## Alternatives considered

1. **Verbatim from issue description's proposed wording.** Keep
   `Discovered during <issue-id> codex review.` as the only prefix
   form. Rejected: the existing **Follow-ups** bullet already
   enumerates impl / review / testing as discovery contexts, so a
   codex-only prefix leaves those filings without a documented
   convention. Generalizing to a four-context menu costs one short
   parenthetical and keeps the prefix and the relation-linking rule in
   sync.
2. **Bullet only, no Autonomous Sessions callout.** Smallest possible
   diff. Rejected: the failure mode is autonomous-mode-specific —
   the original incident (ENG-309/ENG-310) was an autonomous filing,
   and the cross-reference "Use the defaults in Creating Issues below"
   is exactly the prose that got skipped. Surfacing the failure mode
   where the autonomous-context reader is already looking is the
   purpose of the callout.
3. **Lighter callout** — append a single sentence ("Description is
   the most commonly omitted field in autonomous filings — write one
   even when scope is tight.") instead of three. Rejected as
   under-specified: the lighter version doesn't answer "what
   description?" and so likely produces the same omission failure mode
   in different clothing.
4. **Restructure as a `## Description Requirements` subsection** —
   parallel to ENG-275's new `## The "In Design" State` subsection.
   Rejected: scope creep. The diagnosed gap is a checklist omission,
   not a structural one. A subsection invites further restructuring
   and a larger diff that's harder to review in isolation.
5. **Hoist the description-content rule into the `linear-cli` plugin
   skill instead of `linear-workflow`.** Rejected: `linear-cli`
   documents *how* to use commands; `linear-workflow` documents *when*
   and *why* — and the description-content requirement is a workflow
   policy, not CLI mechanics. The `--description-file` recommendation
   is the only piece that touches CLI mechanics, and it's bound to the
   description content rule (markdown with code blocks must round-trip
   safely), so co-locating both in `linear-workflow` reads more
   naturally than splitting.

## References

* Originating incident: ENG-279 (Sensible Ralph, Done). Symptoms most
  visible on ENG-309 ("preserve original base-sha on retry") and
  ENG-310 ("canonicalize paths in `worktree_branch_state_for_issue`"),
  both filed `description: null` and backfilled by hand.
* Precedent for skill-content fixes to `linear-workflow`: ENG-264
  ("linear-workflow: make duplicate check an explicit step for
  autonomous follow-up filings", Done).
* Adjacent in-flight skill-content fix to the same file: ENG-275
  ("Document `In Design` workflow state in `linear-workflow` skill",
  Approved). Set as `blocked-by` for serialization.
