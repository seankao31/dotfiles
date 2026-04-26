# close-branch Reset path aligns with origin/main (ENG-304)

## Problem

In `.claude/skills/close-branch/SKILL.md` Step 3 ("Push"), the **Reset
path** (currently lines 135-141) restores local main with:

```bash
git reset --hard "$PRE_MERGE_SHA"
```

`$PRE_MERGE_SHA` was captured in Step 2 (line 110) after `git pull
--ff-only origin main`, so it equals **the post-pull tip plus any unpushed
direct-to-main commits Sean made before invoking the close ritual** (call
them B, C). When the push is rejected because origin/main has advanced to
A + X + Y (collaborator's pushes), the Reset path leaves:

- `local main` = A + B + C
- `origin/main` = A + X + Y
- `local main` is **diverged** from origin — has B, C that origin lacks,
  lacks X, Y that origin has

The skill's stated invariant at Step 3 is "must not exit while local
`main` is ahead of `origin/main`." Strictly read, "ahead of" is false —
local isn't a strict descendant of origin. But the *intent* of the
invariant is that no stray `git push --force` could overwrite shared
commits, and in the diverged state above, a force-push silently overwrites
X and Y. The intent is violated.

### Connection to ENG-257

ENG-257 fixed the **Retry path** to preserve unpushed direct-to-main
commits (replayed onto the new origin tip via the new substep 3 rebase).
During the codex review of ENG-257's spec, the same divergence shape was
identified in the new spec's second-rejection fallback (which originally
used the same `reset --hard "$PRE_MERGE_SHA"` pattern as the existing
Reset path). ENG-257's fallback was rewritten to use a different approach
that aligns local main with the post-rejection origin tip and preserves
Sean's work on `$FEATURE_BRANCH`:

```bash
git fetch origin main
git reset --hard origin/main
# work preserved on $FEATURE_BRANCH; operator re-runs /close-issue
```

This filing tracks applying the same approach to the **existing Reset
path** so both recovery exits use the same "exit cleanly with
origin-matched main, work preserved on `$FEATURE_BRANCH`" model. ENG-304
does not duplicate the prerequisite work; it lifts the pattern that
ENG-257 already established.

## Fix

Two narrowly-scoped edits across two files: one to the live skill
`.claude/skills/close-branch/SKILL.md`, plus one in-line annotation on
the historical spec `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
that prevents the original buggy snippet from being lifted via grep.

### Edit 1 — Step 3 Reset path: replace snippet and align prose with ENG-257's fallback

**File:** `.claude/skills/close-branch/SKILL.md`

**Section:** Step 3 ("Push"), the Reset path (currently the second
numbered exit option in Step 3, lines 135-141).

**Change:** replace the whole Reset-path block (intro sentence + code
fence + trailing sentence) with a structurally-symmetric version of
ENG-257's second-rejection fallback paragraph: short intro, code fence,
"After this reset:" bulleted state description, "Recovery:" paragraph.

**Before (current lines 135-141):**

```markdown
2. **Reset path** (fallback if retry is not recoverable within this skill): restore local main to its pre-merge state so the operator can investigate without the ff-merge in the way, then exit non-zero with a clear diagnostic:

   ```bash
   git reset --hard "$PRE_MERGE_SHA"
   ```

   The feature branch ref still points at the rebased feature commits; nothing is destroyed.
```

**After:**

```markdown
2. **Reset path** (fallback if retry is not recoverable within this skill): align local main with the post-rejection origin tip and exit non-zero with a clear diagnostic:

   ```bash
   git fetch origin main
   git reset --hard origin/main
   ```

   After this reset:

   - Local main matches `origin/main` exactly. No divergence; no `git push --force` could overwrite shared commits.
   - `$FEATURE_BRANCH` ref points at the Step 1 rebase tip — which absorbed any unpushed direct-to-main commits during the original Step 1 — so both Sean's pre-ritual direct-to-main commits and the rebased feature commits remain reachable.

   Recovery: the operator re-runs `/close-issue`. Step 1's worktree rebase onto the now-fresh local main replays all of `$FEATURE_BRANCH`'s commits onto the new origin tip. No work is lost; no manual cherry-picking required.
```

The substantive changes vs the existing block:

- Snippet body: `git reset --hard "$PRE_MERGE_SHA"` (one command) → `git
  fetch origin main` + `git reset --hard origin/main` (two commands). The
  explicit fetch is required for the same reason ENG-257's Retry path
  substep 1 documents: a rejected push does not reliably update the local
  `origin/main` tracking ref, so resetting to `origin/main` without a
  fresh fetch could land on a stale ref.
- Intro sentence: drops "restore local main to its pre-merge state so the
  operator can investigate without the ff-merge in the way" — the new
  intent is alignment with origin, not preservation of the pre-merge tip.
- Trailing prose: replaced with the bulleted "After this reset:" + the
  "Recovery:" paragraph. The bulleted state description matches
  ENG-257's second-rejection fallback paragraph in shape and wording so
  both exit paths read identically. The "Recovery:" paragraph names the
  operator re-running `/close-issue` as the resumption mechanism.

No change to the surrounding numbered-list scaffolding ("1. **Retry
path**", "2. **Reset path**"); only the contents under item 2 change.

### Edit 2 — Historical spec: in-line deprecation annotation on the bug snippet

**File:** `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`

**Section:** Section "Step 3 — Push", numbered list item 6, the **Reset
path** sub-bullet (currently line 144).

**Rationale:** the historical spec contains the buggy `git reset --hard
"$PRE_MERGE_SHA"` verbatim in its Reset-path bullet and is
grep-discoverable. A future contributor or autonomous session searching
for the recovery mechanics may read that bullet, copy the command, and
miss the live skill's correction. ENG-257 already added an analogous
annotation above the Retry-path bullet (line 143); ENG-304 mirrors that
pattern for the Reset-path bullet immediately below.

**Insertion:** add a blockquote immediately *before* the bullet that
begins `- **Reset path** (if retry is not recoverable by close-branch)`.
Do not modify the bullet's text itself; the historical record of what was
decided at ENG-213 time is preserved, with the post-ENG-304 correction
surfaced alongside it.

**Insertion text:**

```markdown
   > **DEPRECATED — Updated by ENG-304 (2026-04-26):** the `git reset
   > --hard "$PRE_MERGE_SHA"` in the Reset path bullet below was
   > identified as leaving local main diverged from origin/main whenever
   > Sean had unpushed direct-to-main commits at close-issue invocation
   > time, and was replaced in the live skill. **Do not copy this
   > command** into new code or docs. The current correct behavior lives
   > in `.claude/skills/close-branch/SKILL.md` Step 3 and is specified in
   > `docs/specs/close-branch-reset-aligns-with-origin.md`. This historical
   > bullet is preserved as a record of the ENG-213 design decision; it
   > is not the current behavioral spec.
```

The leading three-space indent matches the surrounding bullet's nesting
depth so the blockquote renders inside the bullet's scope. This mirrors
the indentation Edit 4 of the ENG-257 spec uses for the Retry-path
annotation. No other text in `2026-04-23-close-issue-close-branch-split.md`
is changed.

## Why `reset --hard origin/main` is safe here (and `$FEATURE_BRANCH` preserves the work)

Captured for posterity since the destructive verb may raise eyebrows in
review. `reset --hard <SHA>` moves a branch ref + working tree to
`<SHA>`; it does not destroy the old commits, which remain in the object
database and are reachable via `git reflog` for ~30+ days, and via any
other ref that still points at them.

At the moment the new Reset path fires (push rejected, Retry path not
recoverable within this skill), the state is:

- `local main` = `$PRE_MERGE_SHA` + feature ff-merge commits (the
  ff-merge from Step 2 is the reason the push was attempted at all).
- `$FEATURE_BRANCH` ref points at the same feature commits (Step 1
  rebased feature onto local main = `$PRE_MERGE_SHA`; Step 2's ff-merge
  then advanced main to match).
- `$PRE_MERGE_SHA` = original `origin/main` + unpushed direct-to-main
  commits B, C (the post-pull, pre-ff-merge tip captured at Step 2 line
  110).
- `origin/main` (after fetch) = original `origin/main` + collaborator's
  pushes X, Y.

After `git fetch origin main && git reset --hard origin/main`:

- `local main` = original `origin/main` + X + Y (matches origin exactly,
  no divergence).
- `$FEATURE_BRANCH` ref unchanged: still points at original `origin/main`
  + B + C + F's (the rebased-onto-`$PRE_MERGE_SHA` feature tip).
- No commits are unreachable from any ref.

Recovery via re-running `/close-issue`:

- Step 1 rebases `$FEATURE_BRANCH` onto local main = original
  `origin/main` + X + Y, replaying B, C, F's.
- Result: original `origin/main` + X + Y + B' + C' + F's.
- Step 2 ff-merges; Step 3 pushes (no further race in the common case).

Sean's pre-ritual direct-to-main commits (B, C) thus reach `main` via the
feature merge in the next attempt, rather than as standalone direct-to-main
commits. Their content is preserved; their *category* is muddled. For
chezmoi's single-user context this is acceptable — Sean knows from the
original session which commits were originally direct-to-main vs feature.

### Note on the Retry path's *different* reset target

ENG-257's Retry path substep 2 uses `git reset --hard "$PRE_MERGE_SHA"` —
*not* `origin/main`. That asymmetry is intentional. The Retry path's
reset happens *inside* the recovery sequence with the explicit intent to
immediately re-rebase and re-push, so divergence between local main and
origin/main during the Retry attempt is acceptable (it's the ephemeral
working state of the recovery). ENG-304's Reset path fires *on the way
out* of the skill — at that point any local-vs-origin divergence becomes
a force-push hazard, so the reset target is `origin/main` to eliminate
it. The two reset targets serve different invariants and should not be
unified.

## Out of scope

- **Step 1 prose** — ENG-257's Edit 3 already appends a forward-link
  sentence to Step 1's rationale paragraph that references
  `$PRE_MERGE_SHA` and the Retry path. That sentence remains accurate
  for the Retry path after ENG-304; ENG-304 does not need to add a
  parallel sentence about the Reset path. The Reset path's recovery
  model is documented inline at Step 3, which is where readers
  investigating a recovery scenario will land.
- **Step 2's `$PRE_MERGE_SHA` capture** — no change. ENG-257's Retry
  path substep 2 still uses it; the variable remains load-bearing for
  the Retry path even after ENG-304 removes its only Reset-path use.
- **Restructuring or renaming Step 3's two-path organization** — the
  Retry/Reset numbered list scaffolding stays as-is. Only the contents
  under "2. **Reset path**" change.
- **Renaming `$PRE_MERGE_SHA`** — still accurate naming for the Retry
  path's substep-2 use; renaming would introduce churn for no clarity
  gain.
- **Other skills in `agent-config/` or in the `sensible-ralph` plugin**
  — no other live skill uses `git reset --hard "$PRE_MERGE_SHA"` after
  a feature ff-merge. To be re-verified during implementation by
  `grep -rn 'reset --hard "\$PRE_MERGE_SHA"'` across `.claude/`,
  `agent-config/`, and the `sensible-ralph` plugin cache; the only
  expected match is in the historical design spec
  `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
  (line 144), which Edit 2 annotates with the in-line deprecation
  warning.
- **Updating ENG-257's spec doc**
  (`docs/specs/close-branch-retry-preserves-local-main.md`) — that doc's
  out-of-scope section names ENG-304 as the follow-up and reads correctly
  as historical record before, during, and after ENG-304 lands. No edit
  needed.
- **Automated tests for the Reset path** — `close-branch` is a
  prose/markdown skill, not a script; the existing convention is
  operator-driven dogfooding for git-state behaviors. Same TDD exception
  as ENG-257.
- **Hardening other steps for hypothetical race conditions** — the bug
  is scoped to the Reset path's reset target. Do not refactor unrelated
  steps.

## Verification

This is a documentation change to a markdown skill that contains bash
recipes. The bash itself isn't executed by a test harness; it is followed
by a Sonnet-driven Skill invocation in the close-issue ritual.
Verification is therefore prose-correctness plus operator-driven
dogfooding when a real push race occurs.

**TDD exception (Rule #1).** The user-global rule "FOR EVERY NEW FEATURE
OR BUGFIX, YOU MUST follow Test Driven Development" presupposes testable
runtime behavior. A markdown skill with embedded bash recipes is prose;
the correctness check is whether the prose accurately specifies the
intended git operations. The implementer must obtain Sean's explicit
exception during the implementation session, the same way ENG-257's
spec records it.

**Verification steps:**

1. Read the edited `.claude/skills/close-branch/SKILL.md` Step 3 Reset
   path. Confirm:
   - The snippet reads `git fetch origin main` followed by `git reset
     --hard origin/main` (two commands; the explicit fetch precedes the
     reset).
   - The snippet does NOT reference `$PRE_MERGE_SHA`.
   - The intro sentence reads "align local main with the post-rejection
     origin tip and exit non-zero with a clear diagnostic" (or
     equivalent phrasing — alignment, not pre-merge restoration).
   - The "After this reset:" bulleted list has two bullets: one stating
     local main matches `origin/main` exactly with no force-push hazard,
     one stating `$FEATURE_BRANCH` preserves both Sean's pre-ritual
     direct-to-main commits and the rebased feature commits.
   - The "Recovery:" paragraph names re-running `/close-issue` and
     describes Step 1's worktree rebase as the replay mechanism.
2. Confirm the surrounding scaffolding is unchanged: the "1. **Retry
   path** (preferred)" item, the numbered-list structure, the
   final escalation sentence ("If neither path completes cleanly,
   escalate to the operator…"), and the invariant statement at the top
   of Step 3 ("must not exit while local `main` is ahead of
   `origin/main`") all read as before.
3. Read `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
   around line 144. Confirm:
   - The annotation blockquote (Edit 2) appears immediately above the
     `- **Reset path** (if retry is not recoverable by close-branch)`
     bullet, indented to the same depth as the bullet (3 spaces).
   - The annotation references ENG-304, names `git reset --hard
     "$PRE_MERGE_SHA"` as the bug-prone command, and points at
     `.claude/skills/close-branch/SKILL.md` and
     `docs/specs/close-branch-reset-aligns-with-origin.md` as the
     current source of truth.
   - The Reset-path bullet's text itself is unchanged from its current
     content; only the annotation above it is new.
   - ENG-257's Retry-path annotation (above line 143) is unchanged.
   - No other content in `2026-04-23-close-issue-close-branch-split.md`
     is modified.
4. Confirm no other section, heading, code block, or substep elsewhere
   in `.claude/skills/close-branch/SKILL.md` was modified.
5. Run `grep -rn 'reset --hard "\$PRE_MERGE_SHA"'` across `.claude/`,
   `agent-config/`, and the `sensible-ralph` plugin cache. Confirm the
   only remaining matches after this fix are:
   - The Retry path substep 2 in `.claude/skills/close-branch/SKILL.md`
     (added by ENG-257; this is correct, do not edit).
   - The Retry-path bullet in
     `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
     (ENG-257's Edit 4 annotation already covers this).
   - The Reset-path bullet in the same historical spec, immediately below
     ENG-304's new annotation blockquote (this is the annotated
     historical bullet preserved by Edit 2).
6. Optional (not required for sign-off): mentally trace the new Reset-
   path sequence against the bug's repro scenario (local main = A+B+C+F's,
   origin/main races to A+X+Y) and confirm the post-Reset state is local
   main = A+X+Y (matches origin exactly, no divergence), `$FEATURE_BRANCH`
   = A+B+C+F's (work preserved on the feature ref). Then confirm the
   operator's `/close-issue` re-run from this state succeeds: Step 1
   rebases `$FEATURE_BRANCH`'s B, C, F's onto local main = A+X+Y,
   producing A+X+Y+B'+C'+F's; Step 2 ff-merges; Step 3 pushes (no further
   race in the common case).

## Files touched

- `.claude/skills/close-branch/SKILL.md` (one numbered-list item rewritten
  in Step 3 — the Reset path's intro sentence + code fence + trailing
  prose are replaced with the symmetric "After this reset:" / "Recovery:"
  structure).
- `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
  (one annotation blockquote inserted above the Reset-path bullet near
  line 144; bullet text itself unchanged).

Spec doc itself
(`docs/specs/close-branch-reset-aligns-with-origin.md`) is committed
separately as part of the spec workflow, not by this fix.

## Prerequisites

- **ENG-257** (Retry path preserves unpushed local-main commits). ENG-257
  lands the second-rejection fallback paragraph that ENG-304's prose
  mirrors. Implementing ENG-304 first would mean writing the new Reset-
  path prose against an aspirational reference rather than the live
  in-skill model — and the codex review gate on ENG-304 would likely
  flag the same divergence shape that ENG-257 already addresses, looping
  back to "land ENG-257 first." This issue is filed with `blocked-by
  ENG-257`.

## Commit shape

Single commit, docs-only.

Suggested message:

```
fix(close-branch): reset path aligns with origin/main

Ref: ENG-304
```
