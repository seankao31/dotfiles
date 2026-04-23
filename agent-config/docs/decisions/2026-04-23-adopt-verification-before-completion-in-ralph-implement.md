# Adopt `verification-before-completion` in ralph-implement Step 4

## Context

`ralph-implement`'s Step 4 says "All tests must pass before handoff. If not,
fix them — do not suppress, skip, or delete." This expresses the right
policy but leaves mechanism implicit: the skill does not say how "tests pass"
is verified, when the verification command was last run, or what evidence is
required before invoking `/prepare-for-review`.

`superpowers:verification-before-completion` is an existing upstream skill
that encodes exactly this discipline: "NO COMPLETION CLAIMS WITHOUT FRESH
VERIFICATION." It maps success-claiming phrases to violations, gates on
actual exit codes + output inspection, and rejects stale test runs. It has
been present in `obra/superpowers` since before our v5.0.7 pin.

Our stack does not reference this skill anywhere:
- `ralph-implement/SKILL.md`: no mention.
- Any of our five superpowers overrides: no mention.
- `CLAUDE.md`: no mention.
- `agent-config/docs/`: no mention.

The ENG-246 Pass 1 audit flagged this as an adopt-immediately gap per the
ENG-246 PRD open question #2 ("Adoptable-but-unused upstream components…
file an ADR to adopt immediately — don't wait for the Execute phases").

## Decision

Invoke `superpowers:verification-before-completion` from `ralph-implement`
Step 4 before the Step 5 conditional invocation of `/prepare-for-review`.
Treat "all tests pass" as the verification claim the skill gates.

Concretely, Step 4 becomes:

> ## Step 4: Verify tests pass
>
> Invoke `superpowers:verification-before-completion` to gate the claim that
> tests pass. Run the project's verification commands fresh (not from
> memory), read the exit codes and output, and confirm pristine output per
> the project's testing rules (see CLAUDE.md "Testing" section).
>
> If verification does not pass cleanly, fix the issue — do not suppress,
> skip, or delete tests. If the issue cannot be resolved within the session,
> treat as a red flag per Step 5 and do NOT invoke `/prepare-for-review`.

## Consequences

Positive:
- Closes the one gap PRD open question #2 explicitly contemplates.
- Eliminates a whole class of false-positive completion claims in
  autonomous sessions (sessions that pass "tests pass" through memory or a
  stale run instead of a fresh invocation).
- Composes with the CLAUDE.md "Test output MUST BE PRISTINE TO PASS" rule —
  the skill gives that rule an enforcer.

Negative:
- One extra skill invocation per ralph session. Wall-time cost is small
  (the verification runs anyway; only the gate is new).
- Slight coupling to `superpowers:verification-before-completion`. If
  upstream deprecates or significantly changes it, ralph-implement needs a
  patch. Documented in the patches doc.

## Scope of this ADR

This change is bounded to the `ralph-implement` skill's Step 4 text and its
downstream red-flag handling. It does not:
- Change Step 5 (`/prepare-for-review` invocation is still conditional on
  no red flags).
- Change `close-branch` or any skill that handles the post-review merge.
- Add verification-before-completion to Phase 1 (`ralph-spec`) or Phase 2
  (`writing-plans`) — those phases have no test-pass claim to gate.
