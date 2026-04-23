# HITL / AFK label for Linear issues

## Context

`mattpocock/skills`' `to-issues` skill (surveyed in ENG-246 Pass 1) uses a
novel primitive our stack lacks: it tags each filed issue as **HITL**
("human in the loop" — needs a person actively collaborating) or **AFK**
("away from keyboard" — safe for an unattended agent to execute). The
distinction maps 1:1 to an operational question our autonomous pipeline
already has: **which Approved issues should `/ralph-start` pick up in an
overnight batch?**

Today, `ralph-start` picks up every Approved issue in scope that isn't
blocked. It trusts the operator's triage — if Sean transitions an issue to
Approved, it's fair game. In practice some Approved issues are known to
require human-in-the-loop steps (e.g., interactive `/close-feature-branch`
merge, or a design call that still needs discussion mid-implementation) but
are otherwise spec-complete enough to be Approved. There is no machine-
readable way to say "this is Approved, but don't ralph it unattended."

The consequence is either (a) we downgrade HITL issues to a non-Approved
state, losing the "spec is complete" signal, or (b) we let `ralph-start`
pick them up and burn cycles on tickets that will exit-clean for wanting a
human.

## Decision

Add a `ralph-afk` Linear label (name subject to final choice by the
implementing ticket; purpose: "safe for unattended ralph execution").

- `ralph-spec` in the finalization step: prompt the user to tag the issue
  as `ralph-afk` if it's safe for unattended dispatch, or leave untagged
  (HITL-by-default).
- `ralph-start` in its Approved-issue discovery: filter to issues with the
  `ralph-afk` label. Surface untagged-Approved issues in the preflight
  preview ("N Approved issues without the ralph-afk label; dispatch
  manually after review") rather than auto-dispatching them.
- `ralph-start` docs (`agent-config/docs/playbooks/ralph-v2-usage.md`):
  explain the label and the default-HITL posture.

Default posture is HITL (unlabeled = don't dispatch). This errs on the side
of wasting operator attention over wasting autonomous compute on a ticket
that needed a human anyway.

Rename direction is open — `ralph-afk`, `ralph-safe`, or a boolean custom
field are all reasonable. The implementing ticket picks; ADR records the
primitive, not the exact naming.

## Consequences

Positive:
- Principled filter for `/ralph-start`'s Approved-issue discovery.
- Operator retains explicit control: "transition to Approved" is no longer
  conflated with "OK to run overnight."
- Composes with existing `blocked-by` semantics — AFK + blocked still waits
  for blockers; HITL is orthogonal.

Negative:
- Existing Approved issues (currently ~none, historically a small batch)
  would not have the label. One-time backfill or a migration note
  required. The implementing ticket should decide whether to flip default
  during migration (opt-in) or retroactively tag known-AFK past issues
  (opt-out).
- Adds a field to `ralph-spec`'s finalization checklist — marginal, but
  still a net addition to operator effort per ticket.

## Alternatives considered

- **Boolean custom field on the issue** instead of a label. Stronger
  semantics (typed), but Linear's custom fields require admin setup and
  aren't as easy to change later. Label is lighter-weight.
- **Gate on issue state instead** (introduce `ApprovedAfk` state alongside
  `Approved`). Duplicates workflow-state machinery and makes the Linear
  board noisier. Label wins on simplicity.
- **Default to AFK, opt-out to HITL.** Matches frontier model capabilities
  more optimistically, but penalizes the failure mode harder (HITL issue
  gets dispatched, burns compute, exits clean, taints downstream). Default
  HITL is the conservative choice with better failure modes.

## Scope of this ADR

Records the primitive and the default posture (HITL unless explicitly
tagged AFK). The implementing ticket handles label name, Linear workspace
setup, `ralph-spec` + `ralph-start` code changes, and playbook updates.
