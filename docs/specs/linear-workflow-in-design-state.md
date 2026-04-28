# Document `In Design` workflow state in `linear-workflow` skill

**Linear:** ENG-275
**Date:** 2026-04-26

## Goal

Update `agent-config/skills/linear-workflow/SKILL.md` to document the
new **`In Design`** Linear workflow state introduced by ENG-273 (now
`Done`). The skill is currently silent on `In Design` — readers
encountering the state in Linear cannot determine what it represents
or when to transition into / out of it from the skill alone.

State machine after ENG-273 landed:

```
Todo → In Design → Approved → In Progress → In Review → Done
```

## Background

ENG-273 (Sensible Ralph project, plugin-side) shipped:

- A `design_state` userConfig entry in `.claude-plugin/plugin.json`
  defaulting to `"In Design"`.
- A `CLAUDE_PLUGIN_OPTION_DESIGN_STATE` shell default + export in
  `skills/ralph-start/scripts/lib/defaults.sh`.
- Edits to `skills/ralph-spec/SKILL.md` so the spec session
  auto-transitions a `Todo` issue to `In Design` at session start, and
  the step-10 preflight names `In Design` explicitly in its "anything
  else / proceed" branch.
- Linear GraphQL state creation on the `ENG` and `GAM` teams.
- Explicit out-of-scope callout: the chezmoi-side `linear-workflow`
  skill update is filed as a follow-up (this issue, ENG-275) with
  `blocked-by ENG-273`.

`/ralph-start` deliberately does **not** dispatch issues in
`In Design`: its queue builder queries `Approved` only. The state sits
outside the autonomous queue so half-formed designs cannot be picked
up for autonomous implementation.

## Current state of the skill

`agent-config/skills/linear-workflow/SKILL.md` mentions every other
relevant Linear state by name (`Triage`, `Backlog`, `Todo`, `Approved`,
`In Progress`, `In Review`, `Done`, `Canceled`) but is silent on
`In Design`. Two specific gaps:

1. **No state-machine narrative for `In Design`.** A reader cannot
   answer "what does `In Design` mean?" from the skill alone.
2. **Entry Point 1's branch list (lines 66–69)** enumerates which
   states the skill transitions to `In Progress` when a human starts
   work. The current list is `Triage | Backlog | Todo | Approved |
   In Review` (proceed); `Done | Canceled` (stop and ask);
   `In Progress` (skip). `In Design` is absent — a reader looking up
   "what should happen if I start work on an `In Design` issue?" finds
   silence.

## Scope

Three edits to `agent-config/skills/linear-workflow/SKILL.md` only.
No other files change.

### Edit 1 — Add new subsection: `## The "In Design" State`

Place the new subsection **between** the existing
`## Integration with Superpowers Workflow` block (which ends after the
"Active Work Status" subsection at line 97) and `## Creating Issues`
(line 99). The new subsection is a top-level `##` heading so it sits
at the same level as `## Creating Issues`, not nested inside the
Integration block.

Verbatim content of the new subsection:

```markdown
## The "In Design" State

The Linear workflow in this workspace places `In Design` between `Todo` and `Approved`:

`Todo → In Design → Approved → In Progress → In Review → Done`

`In Design` signals that **a human has picked up the issue and is actively running an interactive design or spec session** — typically `/ralph-spec`. It is distinct from `In Progress`, which is reserved for *implementation* (often autonomous, dispatched by `/ralph-start`).

`/ralph-start`'s queue builder deliberately does **not** dispatch issues in `In Design`. The state sits outside the autonomous queue so that a half-formed design doesn't get picked up for implementation.

### Transitions involving `In Design`

| From | To | Trigger |
|---|---|---|
| `Todo` | `In Design` | A human opens an interactive design session on the ticket (typically `/ralph-spec`, which transitions automatically at session start). Don't write `In Design` directly from this skill. |
| `In Design` | `Approved` | The interactive design session concludes successfully and the spec is ready for autonomous dispatch. `/ralph-spec` does this in its finalization step. Don't write `Approved` directly from this skill. |
| `In Design` | `Todo` or `Backlog` | The design session is abandoned without producing an Approved spec. The human resets the issue manually — back to `Todo` if it remains actionable, `Backlog` if the scope needs more thinking. |

### Anti-pattern

`In Design` is **not** for autonomous implementation work — that's `In Progress`. The two states are semantically distinct:

- `In Design` = *design* in flight (interactive, human-driven dialogue).
- `In Progress` = *implementation* in flight (autonomous or interactive coding work).

Don't transition an issue to `In Design` to mean "I'm working on it" when the work is actually implementation. And don't dispatch an `In Design` issue for autonomous coding — `/ralph-start` already prevents this, but the same rule applies if you're writing code directly: complete the design (move to `Approved`) before transitioning to `In Progress`.
```

The subsection title uses heading-style quoting (`The "In Design"
State`) to match the prose style of the rest of the doc — the
existing skill does not use code-fence quoting in headings.

### Edit 2 — Insert `In Design` branch in Entry Point 1's list

Current text in Entry Point 1, step 4 (lines 66–69):

```markdown
4. **Move the issue to "In Progress"** with `linear issue update ID --state "In Progress"` — but read the current state first via `linear issue view ID --json` and branch on it:
   - Already `In Progress`: skip the write. Another actor (e.g., the spec-queue orchestrator) may have pre-transitioned at dispatch; a second write is unnecessary noise.
   - `Triage`, `Backlog`, `Todo`, `Approved`, or `In Review`: transition to `In Progress`. The `In Review` case is legitimate — when resuming implementation to address review feedback, the board must reflect that code is changing again (ralph v2's DAG rule treats `In Review` as resolved-enough-to-build-on, so downstream dispatch races if state lags behind reality).
   - `Done` or `Canceled`: stop and ask the user. These are terminal; reopening warrants explicit confirmation.
```

Insert one new bullet **between** the `Triage, Backlog, …` bullet and
the `Done or Canceled` bullet, so the In Design case is documented in
its natural reading order (between non-terminal proceed states and
terminal stop-and-ask states):

```markdown
   - `In Design`: stop and ask. The state signals that an interactive design session was started but didn't conclude. Starting implementation without first concluding the design (→ `Approved`) means moving forward without a finalized spec. Prompt the user to choose: resume `/ralph-spec`, mark `Approved` and proceed, or abandon back to `Todo`/`Backlog`. See the `In Design` state subsection for context.
```

Behavior justification: `In Design` means a human is mid-session.
Transitioning straight to `In Progress` would skip an Approved spec.
The "stop and ask" branch is the conservative default — the user
explicitly decides whether to resume design, mark Approved, or
abandon, rather than the skill silently proceeding.

### Edit 3 — Append note to Autonomous Sessions section

Current text in `## Autonomous Sessions`, first bullet (lines 138 ff):

```markdown
- **Entry Point 1 does not run.** The orchestrator pre-selects the issue, pre-creates the worktree, and pre-transitions state to `In Progress` before dispatch. The agent reads its issue ID from the prompt and begins implementation directly. There is no "starting work" step to execute.
```

Append one sentence to the end of that bullet (no new bullet, no
blank line between sentences — they form one continuous paragraph):

```markdown
The orchestrator queries `Approved` issues only — issues in `In Design` are deliberately skipped, since they represent in-flight interactive design work, not autonomous-ready implementation work.
```

This ensures readers approaching the doc from the autonomous-context
angle also learn that `In Design` is invisible to `/ralph-start`,
without requiring them to find the new subsection earlier in the doc.

## Out of scope

- **Plugin-side files** (`.claude-plugin/plugin.json`,
  `skills/ralph-start/scripts/lib/defaults.sh`,
  `skills/ralph-spec/SKILL.md`) and the GraphQL state creation on the
  ENG / GAM Linear teams. All shipped by ENG-273.
- **The dot graph at lines 27–57** of the skill. It depicts skill
  *activation* points, not the Linear state machine. Adding `In Design`
  (which the skill does not activate on) would muddy that abstraction.
- **Other chezmoi skills** that may eventually want to know about
  `In Design` (e.g. `prepare-for-review`, `claude-md-improver`,
  `linear-visualize`). File as separate issues if/when a concrete need
  surfaces.
- **Quick Reference section.** Its content is CLI-mechanics-focused
  (priority values, relation types, `Canceled` spelling). State
  semantics belong in the new subsection, not here.
- **Restructuring or reordering existing Entry Point narrative**
  beyond the single-bullet insertion in Edit 2 and the single-sentence
  append in Edit 3.
- **Adding a full per-state reference table** for every Linear state
  in the workspace. This was considered (Approach 2 in the design
  dialogue) but rejected as scope creep — the issue's acceptance
  criteria are framed around `In Design` specifically, and writing
  one-liners for states the issue did not ask for risks getting one
  wrong and needing a follow-up.

## Acceptance criteria

- [x] `agent-config/skills/linear-workflow/SKILL.md` contains a new
      top-level subsection titled `## The "In Design" State`,
      positioned between `## Integration with Superpowers Workflow`
      and `## Creating Issues`.
- [x] That subsection includes the state-machine line
      (`Todo → In Design → …`), a definition paragraph identifying
      `In Design` as interactive-design-session-in-flight, the
      transition table covering `Todo → In Design`,
      `In Design → Approved`, and `In Design → Todo or Backlog`, the
      `/ralph-start` skip note, and the anti-pattern callout
      contrasting `In Design` with `In Progress`.
- [x] Entry Point 1's branch list includes a new bullet for
      `In Design` with the "stop and ask" behavior described above.
- [x] The first bullet of the `## Autonomous Sessions` section ends
      with the appended sentence noting that `/ralph-start` queries
      `Approved` issues only and skips `In Design`.
- [x] No other lines in the file change. The dot graph, all other
      Entry Point narrative, Active Work Status, Creating Issues,
      Duplicate Prevention, When This Does NOT Apply, Workspace
      Context, and Quick Reference are byte-identical to the pre-edit
      version.
- [x] A reader can answer "what does `In Design` mean and when does
      it transition?" from this skill alone, without needing to look
      at Sensible Ralph plugin docs.

## Verification

The autonomous implementer should run all of the following after the
edits land. Each is a fast mechanical check; they collectively gate
handoff:

1. `grep -nE '^## The "In Design" State$' agent-config/skills/linear-workflow/SKILL.md`
   returns exactly one match. The match's line number is **after** the
   final line of the `## Integration with Superpowers Workflow` block
   and **before** the `## Creating Issues` heading.
2. `grep -n '`In Design`' agent-config/skills/linear-workflow/SKILL.md`
   returns matches in the new subsection (multiple), Entry Point 1's
   branch list (at least one), and the Autonomous Sessions section
   (at least one).
3. `grep -n 'queries `Approved` issues only' agent-config/skills/linear-workflow/SKILL.md`
   returns exactly one match, inside the Autonomous Sessions section.
4. `git diff agent-config/skills/linear-workflow/SKILL.md` shows
   **only** additions (no deletions, no edits to existing lines)
   except for the insertion-point context lines git naturally shows
   around the inserts. If any pre-existing line is modified, the diff
   has drifted from spec — abort and re-do.
5. Read the changed file end-to-end. Confirm the new content reads
   naturally in the surrounding prose (no orphan headings, no broken
   markdown lists, no doubled blank lines).

## Prerequisites

None still in flight. ENG-273 (`blocked-by`) is `Done`. The
`blocked-by ENG-273` relation can remain on the issue — `/ralph-start`'s
preflight treats `Done` and `In Review` blockers as resolved, so the
relation no longer gates dispatch.

## Testing expectations

No new automated tests. All changes are markdown prose in a skill
file. Validation is the verification suite above plus the codex
review at `/prepare-for-review`, which catches edit drift on markdown.

## Alternatives considered

1. **Focused `In Design` subsection plus surgical edits — chosen.**
   Smallest reasonable change. Satisfies all three of the issue's
   acceptance criteria with one new top-level subsection and two
   one-line additions to existing prose. Doesn't disturb the dot
   graph's abstraction (skill-activation, not state-machine) or risk
   misdescribing other states.
2. **Full `Workflow States` reference table.** Same placement as the
   chosen approach but the new subsection is a complete state-by-state
   reference (Backlog, Triage, Todo, In Design, Approved, In Progress,
   In Review, Done, Canceled) instead of an `In Design`-only block.
   Rejected: doubles the diff size, requires writing accurate
   one-liners for states the issue did not ask for, and risks getting
   one wrong (e.g., misdescribing `Triage`'s scope) and needing a
   follow-up issue. Scope creep.
3. **Restructure the skill to a state-machine-first organization.**
   Promote the state machine to the primary narrative and re-key the
   Entry Points off current state instead of trigger context.
   Rejected: large diff, well outside ENG-275's framing, and probably
   the right call only after several more states / transitions
   accumulate. File as a future issue if the skill keeps growing.
4. **Update the dot graph at lines 27–57 to include `In Design` as a
   state node.** Rejected because the dot graph depicts *skill
   activation* — the contexts in which the skill kicks in — not
   Linear's state machine. `In Design` is owned by `/ralph-spec`; the
   `linear-workflow` skill never writes `In Design` directly. Adding
   it to the graph would conflate two distinct abstractions.
5. **Treat `In Design` like `Todo` in Entry Point 1 (transition to
   `In Progress` and continue).** Rejected during the design dialogue.
   `In Design` specifically signals "human is mid-session"; bypassing
   straight to `In Progress` would silently skip an Approved spec. The
   "stop and ask" branch makes the user's intent explicit.

## Notes

- The `linear-workflow` skill lives in chezmoi (in this repo) under
  `agent-config/skills/`, not in the `sensible-ralph` plugin repo.
  Cross-repo routing policy is documented in this repo's CLAUDE.md
  (Linear section) and in `sensible-ralph/CLAUDE.md`.
- Once these edits land, the skill is the single source of truth for
  `In Design` semantics from the user-facing side. Sensible Ralph docs
  describe how the state is *managed* by the plugin's orchestration;
  this skill describes what the state *means* and how to reason about
  it when interacting with Linear.
