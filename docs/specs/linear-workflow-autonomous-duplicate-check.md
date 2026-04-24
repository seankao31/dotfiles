# linear-workflow: make duplicate check an explicit step for autonomous follow-up filings

ENG-264 · Agent Config

## Problem

The `linear-workflow` skill's "Autonomous Sessions" section (`agent-config/skills/linear-workflow/SKILL.md:136`–143) describes *what to do* when a duplicate is found but doesn't mandate *running* the duplicate check as a required step before filing. Autonomous agents read the section as elaboration on assumed behavior rather than a required pre-file check, and skip the search entirely when filing follow-ups.

### Incident

During the ENG-239 autonomous ralph session on 2026-04-23, the agent encountered `ralph-output.log` as an unexpected untracked file during its pre-flight, filed ENG-258 ("prepare-for-review pre-flight should gitignore ralph-output.log") as a follow-up, and exited clean.

The agent did not:

1. Search Linear (`linear issue query --search <term>`) for prior tickets covering the same ground.
2. Check `main` (`git log main --oneline --grep <term>`) for already-shipped fixes.

ENG-237 ("Gitignore ralph orchestrator artifacts to eliminate spurious pre-flight prompts") had shipped on main ~82 minutes earlier that same day via commits `698b571` and `8cdcfd5`. The autonomous session's branch diverged from main at 16:00, before ENG-237's fix landed (17:22), so the worktree showed the pre-fix state — and the agent generalized that local observation into a new ticket without checking whether the fix existed elsewhere.

Result: ENG-258 canceled as a duplicate of ENG-237 on 2026-04-24.

Separately, during the ENG-258 cancellation on 2026-04-24, a jq-path bug nearly caused the same duplicate to be missed a second time — the `--search` query returned `[]` because of a filter bug, not because there was no match. This establishes empty-search verification as a universal concern, not an autonomous-only one.

## Scope

One file modified: `agent-config/skills/linear-workflow/SKILL.md`. Two edits.

The `digraph linear_flow` diagram is unchanged — it maps entry points, not sub-steps within an entry point. No other files are touched (CLAUDE.md autonomous-mode overrides, `ralph-v2-usage.md`, and `linear-cli` plugin docs are all unrelated to the filing-side logic under edit).

## Edit 1 — "Duplicate Prevention" section, step 1

**Current** (`agent-config/skills/linear-workflow/SKILL.md:123`):

```markdown
1. Query issues filtered by the target **project** using `linear issue query --search "term" --json` or scoped with `--team`.
```

**Replace with:**

```markdown
1. Query issues filtered by the target **project** using `linear issue query --search "term" --json` or scoped with `--team`. Cross-check an empty result by re-running without `--search` and filtering in jq — empty `--search` output has been a jq-path bug before, not a true absence.
```

Rationale: the jq-path bug surfaced during an interactive cancellation flow, so the verification trap applies to both modes. Adding it here puts it at the canonical source, and the autonomous section references it.

## Edit 2 — "Autonomous Sessions" section, fourth bullet

**Current** (`agent-config/skills/linear-workflow/SKILL.md:143`):

```markdown
- **Duplicate prevention resolves without human decision.** Exact duplicates: don't create. Partial overlaps: file the new issue anyway and post a comment on both linking them, so the human reviewer can merge or adjust later. Never block waiting on a "let the user decide" prompt.
```

**Replace with:**

```markdown
- **Before filing, run the duplicate check.** Run both:
  1. Linear search via `linear issue query --search "term" --json` (per "Duplicate Prevention" above). If the result is empty, re-run without `--search` and filter in jq before trusting it — empty `--search` output has been a jq-path bug before, not a true absence.
  2. `git log main --oneline --grep "term"` — the worktree can lag `main` by hours and a recently-shipped fix may be invisible locally.

  If the check finds a match: exact duplicate → don't create. Partial overlap → file the new issue, add a comment on both linking them so the human reviewer can merge or adjust. Never block waiting on a "let the user decide" prompt.
```

Rationale: the fix is fundamentally about verb mood — the current bullet is descriptive ("resolves without human decision") and autonomous agents read it as ambient truth rather than a prerequisite action. The rewrite leads with an imperative ("Before filing, run the duplicate check"), enumerates the two required commands as a sub-checklist (explicit steps, not prose), and relocates the duplicate-handling semantics to the end where they naturally follow the check outcome.

The second bullet (Entry Point 2 filing defaults) is untouched — it correctly describes the *filing* step, which now sits *after* the duplicate check in the reader's mental sequence thanks to the new bullet's opening clause.

## Acceptance criteria

1. `agent-config/skills/linear-workflow/SKILL.md` "Autonomous Sessions" section enumerates the duplicate check as a required pre-file step (sub-checklist, not prose).
2. The section explicitly requires both Linear search AND `git log main --oneline --grep` for follow-up filings.
3. Both the "Autonomous Sessions" section and the generic "Duplicate Prevention" section include a note on verifying empty search results before trusting them.
4. No other behavioral changes — existing bullets 1, 2, and 3 in "Autonomous Sessions" are preserved verbatim.

## Verification

Manual review only — this is prose, no automated test is worth building for this class of change.

Two checks after the edit:

1. Re-read the "Autonomous Sessions" section top-down. An autonomous agent reading it would run the duplicate check before filing (imperative, not ambient).
2. `rg 'resolves without human decision' agent-config/skills/linear-workflow/` returns no matches — confirms the old descriptive phrasing is gone.

## Alternatives considered

- **Approach B — consolidate bullets 2 and 4 into a single ordered "filing follow-ups" flow.** Cleaner sequence but a larger diff, and the remaining two bullets (Entry Point 1, Entry Point 3) would look stylistically inconsistent next to an ordered list. Rejected as structurally disproportionate to the diagnosed bug.
- **Approach C — hoist duplicate check into a shared "Before filing any issue" subsection referenced by both interactive and autonomous paths.** Best factoring in principle but a larger restructure than the ticket asked for; the interactive-vs-autonomous distinction (main-grep required autonomously, optional interactively) muddies the "single subsection" cleanliness. Risks re-litigating ENG-183's structural choices. Rejected.
- **Broadening the `git log main` requirement to interactive mode.** Interactive sessions typically have main checked out (no worktree lag), so the concern doesn't apply. Rejected — the failure mode is autonomous-specific.

## Out of scope

- `CLAUDE.md` autonomous-mode overrides — govern escalation behavior, not filing logic.
- `agent-config/docs/playbooks/ralph-v2-usage.md` — end-user-facing playbook, not agent instructions.
- The `linear-cli` plugin skill — documents *how* to use commands; this spec is about *when* to use them.
- `digraph linear_flow` in the same SKILL.md — maps entry points, not sub-steps within an entry point.

## References

- Origin incident: ENG-258 (canceled as duplicate of ENG-237)
- Prior audit that produced current "Autonomous Sessions" section: ENG-183 (Done)
- Shipped fix that was missed: ENG-237 (Done; commits `698b571`, `8cdcfd5`)
