# Autonomous approval gates: move override into callee skills

## Context

Two skills in this repo — `capture-decisions` and `prune-completed-docs` — end their proposal phase with an "ask the user to approve before writing" gate. Both are invoked inside `/prepare-for-review`, which runs in autonomous `claude -p` sessions dispatched by `/ralph-start` as well as in interactive sessions.

In an autonomous session there is no human to approve. `/prepare-for-review` currently patches around this with caller-side override paragraphs in its Step 2 and Step 3:

> **In autonomous sessions (ralph loop):** `capture-decisions` presents a proposal and says "wait for approval before writing." With no human present, treat this as a self-approval — propose, then execute immediately.

This patch is fragile. The callee's SKILL.md continues to tell the agent to wait for approval at the exact decision point; the caller's override lives several lines away in a different file. When two SKILL.md files disagree at the decision point, the callee wins in practice — the agent follows the rule it reads closest to the moment it's about to act.

Separately, once `capture-decisions` and `prune-completed-docs` run, the reviewer has no direct visibility into what they produced. New ADRs, inline comments, deleted plans — all visible in the diff if someone hunts, but not surfaced in the `/prepare-for-review` handoff comment. The comment is the review-summary surface; documentation changes belong there.

ENG-228 (Approved, `blocked-by`) establishes the autonomous-mode framing at the CLAUDE.md + playbook layer. This spec applies that framing to three specific SKILL.md files without touching CLAUDE.md or the playbook.

## Scope

**In scope:**

- `agent-config/skills/capture-decisions/SKILL.md` — add `## Autonomous sessions` section; append inline pointer to the Step 3 approval-gate sentence.
- `agent-config/skills/prune-completed-docs/SKILL.md` — add `## Autonomous sessions` section; append inline pointer to the "Proposed Changes Protocol" approval-gate sentence.
- `agent-config/skills/prepare-for-review/SKILL.md` — remove the two `In autonomous sessions (ralph loop):` workaround paragraphs (Steps 2 and 3); extend the Step 6 Review Summary template with a `**Documentation changes:**` section.

**Out of scope:**

- Runtime detection of autonomous mode (`.ralph-base-sha` check, env var, caller-passed argument). Deferred — the contextual approach matches the existing `linear-workflow` pattern and is sufficient.
- Changing the review-summary template's other sections (Deviations, Surprises, QA plan, Known gaps, Commits).
- Redesigning `capture-decisions`' category model (what counts as a decision) or `prune-completed-docs`' classification rules.
- Touching `ralph-implement`, `ralph-start`, `progress.json`, or the orchestrator.
- Applying the same pattern to other skills with approval gates — none identified, but follow-ups can file separately.
- Updating `agent-config/CLAUDE.md` or `agent-config/docs/playbooks/ralph-v2-usage.md`. Those are ENG-228's territory.

**Non-goals:**

- Not introducing a new mode-detection mechanism. The agent's contextual awareness (via the ralph dispatch chain, `.ralph-base-sha` presence, `$ISSUE_ID` in scope) is the signal.
- Not re-validating `linear-workflow`'s pattern. We are mirroring it, not redesigning it.

## Design

### Approach: callee-owned override with decision-point inline pointer

The core failure mode of the current caller-side workaround is that the callee's "wait for approval" directive sits at the decision point while the override lives elsewhere. Moving the override into the callee addresses this — but only if it lands at the decision point, not just in a separate section.

Each callee skill gets two changes:

1. A dedicated `## Autonomous sessions` section near the end of the file (mirrors the placement `linear-workflow` uses for its section of the same name).
2. An inline pointer appended to the existing approval-gate sentence.

The inline pointer is the load-bearing change. The section is for discoverability when readers scan for autonomous-mode behavior. Doing only the section (no inline pointer) reproduces the original failure mode at reduced severity. Doing only the inline pointer (no section) works but breaks parallelism with `linear-workflow`.

### Content: `## Autonomous sessions` section

Placement: immediately before the terminal section of each skill (`## What Not to Do` in capture-decisions, `## Common Mistakes` in prune-completed-docs). Both positions are end-of-file — matching `linear-workflow`'s placement of the same-named section.

Content for `capture-decisions`:

```markdown
## Autonomous sessions

In autonomous sessions (`claude -p` dispatched by `/ralph-start`), there is no human to approve the proposal. Skip Step 3's approval gate and proceed immediately to Step 4 (Execute) after forming the proposal. The reviewer sees the resulting decisions in `/prepare-for-review`'s handoff comment under **Documentation changes** — that's the review surface, not a per-skill approval.

See `agent-config/docs/playbooks/ralph-v2-usage.md` § Autonomous mode overrides for the general autonomous-mode behavior model (this is the skill-specific application).
```

Content for `prune-completed-docs` (same shape, different step/action verbs):

```markdown
## Autonomous sessions

In autonomous sessions (`claude -p` dispatched by `/ralph-start`), there is no human to approve the proposal. Skip the "Wait for explicit approval before executing" gate in the Proposed Changes Protocol and proceed immediately to the Execution phase after forming the proposal. The reviewer sees the resulting pruned docs in `/prepare-for-review`'s handoff comment under **Documentation changes** — that's the review surface, not a per-skill approval.

See `agent-config/docs/playbooks/ralph-v2-usage.md` § Autonomous mode overrides for the general autonomous-mode behavior model (this is the skill-specific application).
```

### Content: inline pointers at the approval-gate sentence

Both inline pointers use the same parenthetical form so future audits can grep for them.

`capture-decisions/SKILL.md` — Step 3, current final line `Wait for approval before writing.` becomes:

```
Wait for approval before writing. (In autonomous sessions, skip this gate — see § Autonomous sessions.)
```

`prune-completed-docs/SKILL.md` — end of "Proposed Changes Protocol", current sentence `Wait for explicit approval before executing.` becomes:

```
Wait for explicit approval before executing. (In autonomous sessions, skip this gate — see § Autonomous sessions.)
```

### Content: removals from `prepare-for-review/SKILL.md`

Delete the Step 2 paragraph starting `**In autonomous sessions (ralph loop):** `capture-decisions` presents a proposal…` through to `…The user will review the decisions at review time.`

Delete the Step 3 paragraph starting `**In autonomous sessions (ralph loop):** Same as Step 2 — `prune-completed-docs` also has an approval gate…` through to `…proceed immediately after presenting the proposal.`

No replacement pointer. The callees now own the override; a caller-side cross-reference would be duplication, not clarification.

Preserve the adjacent "Note on commits" paragraph in Step 2 — it's about commit grouping, unrelated to the approval gate.

### Content: `Documentation changes` section in the Review Summary template

Placement: inside the Step 6 heredoc template, under the `## Review Summary` heading, between `**Surprises during implementation:**` and the `## QA Test Plan` heading. This keeps summary items grouped together (what shipped, deviations, surprises, documentation changes) before the reviewer transitions to the QA steps. "Known gaps / deferred" stays where it is under QA Test Plan — it's about verification, not about summary.

Template block added verbatim (including the trailing blank line for separation):

```
**Documentation changes:** <bulleted list of decisions captured and docs pruned this session; "None" if nothing>
- Decision: <file:line or path> — <one-sentence summary>
- Pruned: <path> — <one-sentence reason>

```

Examples illustrate expected output, not spec content. Concrete handoffs look like:

```
**Documentation changes:**
- Decision: agent-config/skills/capture-decisions/SKILL.md:95 — inline pointer explains autonomous-mode skip
- Decision: docs/decisions/2026-04-25-autonomous-mode-callee-ownership.md (new ADR)
- Pruned: docs/plans/2026-04-10-obsolete-orchestrator-notes.md — superseded by ralph v2 design
```

Or, for a session with no documentation output:

```
**Documentation changes:** None
```

The "None" form matches the template's existing convention (used by Deviations, Surprises, Known gaps).

### Data flow

1. `/prepare-for-review` runs in an autonomous session.
2. Step 2 invokes `capture-decisions`. The skill forms a proposal. At its Step 3 the agent reads the inline pointer ("In autonomous sessions, skip this gate"), skips the approval gate, executes Step 4, commits. Output: inline comment sites, ADR paths, MEMORY.md updates.
3. Step 3 invokes `prune-completed-docs`. Same pattern: forms proposal, skips the approval gate per the inline pointer, executes. Output: deleted/archived paths.
4. Step 6 assembles the handoff comment. The agent populates `**Documentation changes:**` with lines collected from Step 2 (prefixed `Decision:`) and Step 3 (prefixed `Pruned:`). Writes "None" if empty.
5. Comment posts; Step 7 transitions issue to In Review.

The agent populates `Documentation changes` from in-context state — it just ran both skills in this session and knows what each produced. No shell variable passing or file exchange needed.

### Mode detection

Detection is contextual, matching `linear-workflow`'s established pattern. The SKILL.md text describes the mode ("`claude -p` dispatched by `/ralph-start`") and the action ("skip the gate"). The agent infers whether the session matches. Signals available to the agent include:

- `claude -p` runtime (no TTY, no interactive prompts available)
- `.ralph-base-sha` present in worktree root (written by the orchestrator before dispatch)
- `$ISSUE_ID` set earlier in the skill chain via `ralph-implement`
- The skill's own invocation context (was it called from `/prepare-for-review` inside a ralph session?)

No runtime check is added. The contextual approach is lighter, matches existing convention, and — combined with ENG-228's explicit "Autonomous mode overrides" framing — gives the agent clear ground to stand on.

### Error handling and edge cases

- **Interactive-mode regression.** The inline pointer is a conditional — "In autonomous sessions, skip this gate." In interactive mode the original directive still applies. No runtime branching required; the agent reads the full sentence and picks the branch that matches its session.
- **Callee invoked outside `/prepare-for-review`.** `capture-decisions` and `prune-completed-docs` can be run standalone (user types `/capture-decisions` interactively). The autonomous-sessions rule still applies symmetrically — in an autonomous standalone run, skip the gate. In an interactive standalone run, keep it. The rule doesn't care about the caller, only the session mode.
- **Caller/callee landing order.** ENG-230 is `blocked-by ENG-228`, so the playbook's `§ Autonomous mode overrides` section exists by the time ENG-230 lands. The playbook reference in each `## Autonomous sessions` section is a cross-reference, not load-bearing — the paragraph's first sentence defines the condition and action without depending on the playbook.
- **Agent ignores the inline pointer.** Mitigated by the dedicated section providing a second anchor. Both together is the belt-and-suspenders. If both are missed, that's an agent-quality issue, not a skill-design one.
- **Empty `Documentation changes` in interactive re-runs.** If `/prepare-for-review` is re-run after feedback commits and neither skill produces output, the section reads `**Documentation changes:** None` — same as any other empty-state section. No special handling.

### Testing

SKILL.md files have no automated test harness. Verification is manual and structural:

1. `grep -c "## Autonomous sessions" agent-config/skills/capture-decisions/SKILL.md` → exactly `1`.
2. `grep -c "## Autonomous sessions" agent-config/skills/prune-completed-docs/SKILL.md` → exactly `1`.
3. `grep -F "(In autonomous sessions, skip this gate" agent-config/skills/capture-decisions/SKILL.md` → exactly one match.
4. `grep -F "(In autonomous sessions, skip this gate" agent-config/skills/prune-completed-docs/SKILL.md` → exactly one match.
5. `grep -c "In autonomous sessions (ralph loop):" agent-config/skills/prepare-for-review/SKILL.md` → exactly `0`. (Both workaround paragraphs removed.)
6. `grep -F "**Documentation changes:**" agent-config/skills/prepare-for-review/SKILL.md` → at least one match, inside the Step 6 `cat > "$COMMENT_FILE" <<COMMENT` heredoc.
7. End-to-end dry run (readthrough only, no execution): open the three SKILL.md files side by side and walk the agent's reading path from `/prepare-for-review` Step 2 → `capture-decisions` → its Step 3 approval gate. The inline pointer must appear on the same line as "Wait for approval before writing." Confirm the agent has no reason to stop at the gate in autonomous mode.

No dogfood run required as part of ENG-230. The next real ralph session against any Approved issue will exercise the full path, and any bug shows up as a regression in that session's `progress.json`.

## Implementation steps

Execute in order. Each step is a verifiable unit; commit after each step (or as a single commit at the end — both are acceptable; the branch will be cleaned by `clean-branch-history` in `/prepare-for-review`).

1. **Edit `agent-config/skills/capture-decisions/SKILL.md`:**
   a. Append `(In autonomous sessions, skip this gate — see § Autonomous sessions.)` to the existing "Wait for approval before writing." sentence at the end of Step 3.
   b. Insert the `## Autonomous sessions` section (content per the design) immediately before the `## What Not to Do` section.

2. **Edit `agent-config/skills/prune-completed-docs/SKILL.md`:**
   a. Append `(In autonomous sessions, skip this gate — see § Autonomous sessions.)` to the existing "Wait for explicit approval before executing." sentence at the end of the "Proposed Changes Protocol" section.
   b. Insert the `## Autonomous sessions` section (content per the design) immediately before the `## Common Mistakes` section.

3. **Edit `agent-config/skills/prepare-for-review/SKILL.md`:**
   a. Delete the Step 2 paragraph `**In autonomous sessions (ralph loop):** …review the decisions at review time.`
   b. Delete the Step 3 paragraph `**In autonomous sessions (ralph loop):** Same as Step 2…proceed immediately after presenting the proposal.`
   c. Inside the Step 6 `cat > "$COMMENT_FILE" <<COMMENT` heredoc, add the `**Documentation changes:**` block under the `## Review Summary` heading, between `**Surprises during implementation:**` and the `## QA Test Plan` heading. Content per the design.

4. **Run verification (the seven structural checks from the Testing section).** All must pass.

5. **Commit.** Single commit if convenient, else multiple; commit messages follow repo style (e.g., `skills: move autonomous-mode approval-gate override into callees (ENG-230)`).

## Verification

After implementation, before handoff:

1. Seven structural grep checks from the Testing section all pass.
2. `git diff` against merge-base shows only insertions in capture-decisions and prune-completed-docs (the new section + inline pointer), and only the two deletions + one insertion in prepare-for-review.
3. No whitespace-only or formatting-only changes in unrelated parts of the files.
4. Readthrough: open all three SKILL.md files; confirm the autonomous-mode rule is findable (a) at the decision point, (b) in a dedicated section, (c) not in the caller.

## Follow-up work (NOT in this ticket)

- If further skills are discovered with the same approval-gate-in-autonomous-mode problem, file a new ticket applying the same pattern.
- If the contextual detection proves unreliable (agent fails to classify autonomous vs interactive correctly in real sessions), file a follow-up to add a deterministic runtime check via `.ralph-base-sha`.

## Open questions

None at spec time. All design questions were resolved during the spec dialogue.
