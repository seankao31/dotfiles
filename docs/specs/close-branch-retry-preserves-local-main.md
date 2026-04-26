# close-branch retry path preserves local-main commits (ENG-257)

## Problem

In `.claude/skills/close-branch/SKILL.md` Step 3 ("Push"), the Retry path
substep sequence is:

```bash
git fetch origin main
git reset --hard origin/main
# re-rebase worktree, re-ff-merge, re-push
```

This `reset --hard origin/main` orphans any commits that existed on local
`main` before the feature ff-merge and were not yet pushed. This is an
explicitly-supported case in this skill — the "rebase onto LOCAL main, not
`origin/main`" rationale at Step 1 (line 75) exists precisely because Sean
sometimes commits directly to local main (progress logs, plan tweaks) without
pushing immediately.

After the reset, the unpushed commits B, C are reachable only via `git
reflog`. The follow-up worktree re-rebase happens to recover them in many
cases via patch-id matching, but the recovery is fragile: any interruption,
conflict, or operator intervention in the window between the reset and the
re-rebase leaves B and C with no branch ref reaching them.

The existing `PRE_MERGE_SHA` capture in Step 2 (line 110) — added as the
safety ref for the Reset path fallback — already records the exact state
that preserves these commits. The Retry path can use the same ref to avoid
the orphaning entirely.

### Scope note — inherited, not introduced by ENG-213

The identical Retry sequence existed in the pre-split `close-feature-branch`
skill's Step 3 recovery. ENG-213 reorganized the skill into `close-issue` +
`close-branch` and made the "never exit while local main is ahead of
origin/main" invariant explicit, but the Retry mechanics were preserved
verbatim. This issue was filed because the codex review gate on the ENG-213
handoff surfaced it; the bug itself predates the split.

## Fix

Four narrowly-scoped edits across two files: three to the live skill
`.claude/skills/close-branch/SKILL.md`, plus one in-line annotation on
the historical spec `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
that prevents the original buggy snippet from being lifted via grep.

### Edit 1 — Step 3 Retry path: replace the reset target and add a rebase

**File:** `.claude/skills/close-branch/SKILL.md`

**Section:** Step 3 ("Push"), the Retry path numbered substeps (currently
five substeps, becoming six after the edit).

**Change:** replace the existing substep 2 (`git reset --hard origin/main`)
with two substeps that preserve unpushed direct-to-main commits.

**Before (substeps 1–5 of the Retry path):**

1. `git fetch origin main` — a rejected push does not reliably update the
   local `origin/main` tracking ref. Without an explicit fetch, the
   subsequent reset would land on the *pre-rejection* `origin/main` (stale),
   the worktree rebase would target that stale ref, and Step 2's
   `git pull --ff-only` would finally advance local main — leaving the
   worktree branch based on an ancestor of the new HEAD and failing the
   ff-only merge.
2. `git reset --hard origin/main` on local main (discards the local
   ff-merge; the feature commits are still reachable via `$FEATURE_BRANCH`).
3. Re-run Step 1 on the worktree (rebase onto the now-fresh local main,
   which equals the new origin/main).
4. Re-run Step 2 (capture a fresh `$PRE_MERGE_SHA`, ff-merge).
5. Re-run the push.

**After (substeps 1–6 of the Retry path):**

1. `git fetch origin main` — a rejected push does not reliably update the
   local `origin/main` tracking ref. Without an explicit fetch, the
   subsequent reset would land on the *pre-rejection* `origin/main` (stale),
   the worktree rebase would target that stale ref, and Step 2's
   `git pull --ff-only` would finally advance local main — leaving the
   worktree branch based on an ancestor of the new HEAD and failing the
   ff-only merge.
2. `git reset --hard "$PRE_MERGE_SHA"` on local main. Restores main to the
   state captured in Step 2 — the post-pull, pre-ff-merge tip — which
   includes any unpushed direct-to-main commits Sean made before invoking
   the close ritual. The feature commits are still reachable via
   `$FEATURE_BRANCH`; the unpushed direct-to-main commits are now reachable
   via `main` itself, not only via reflog.
3. `git rebase origin/main` on local main. Replays any commits between
   `$PRE_MERGE_SHA` and the original `origin/main` (i.e., the unpushed
   direct-to-main commits) onto the new collaborator-pushed tip. In the
   common case (no unpushed commits), this is a no-op fast-forward.
   Conflict handling: see the paragraph beginning "If `git rebase
   origin/main` in substep 3 conflicts" below the numbered list.
4. Re-run Step 1 on the worktree (rebase onto the now-fresh local main,
   which equals the new origin/main plus any replayed direct-to-main
   commits).
5. Re-run Step 2 (capture a fresh `$PRE_MERGE_SHA`, ff-merge).
6. Re-run the push.

The substep numbering shifts by one; substeps 4–6 are textually identical
to the old substeps 3–5 modulo the renumber.

**Second-rejection fallback (added prose paragraph after the numbered list,
before the conflict-handling paragraph from Edit 2):**

> **The Retry path is bounded to a single attempt.** If the re-push in
> substep 6 is also rejected — a second collaborator push raced this retry
> — the Retry path is exhausted. Fetch the new origin tip and reset local
> main to match it, then exit non-zero with a diagnostic.
>
> ```bash
> git fetch origin main
> git reset --hard origin/main
> ```
>
> After this reset:
>
> - Local main = `origin/main` exactly. No divergence; no `git push
>   --force` could overwrite shared commits.
> - `$FEATURE_BRANCH` still points at the substep-5 ff-merge tip, which
>   contains both Sean's replayed direct-to-main commits (B', C' from
>   substep 3) and the rebased feature commits (F's). Nothing is orphaned.
>
> Recovery: the operator re-runs `/close-issue`. Step 1's worktree rebase
> onto local main replays all of `$FEATURE_BRANCH`'s commits (B', C', F's)
> onto the new origin tip, producing fresh B'', C'', F''s in the next
> attempt. No work is lost; no manual cherry-picking required. This
> bounded-retry-then-exit-cleanly model avoids an unbounded retry loop in
> the rare double-race case while keeping the "no force-push hazard"
> invariant on every exit path.
>
> Note: this fallback's reset target (`origin/main`) differs from the
> existing Reset path's target (`$PRE_MERGE_SHA`, line 138) by design. The
> existing Reset path has the same divergence flaw whenever Sean has
> unpushed direct-to-main commits; aligning the two paths is tracked as
> **ENG-304** and is intentionally out of scope for ENG-257. Using
> `origin/main` here from the start avoids inheriting the flaw in the new
> code.

### Edit 2 — Step 3 Retry path: conflict-handling paragraph

**File:** `.claude/skills/close-branch/SKILL.md`

**Section:** Step 3 ("Push"), Retry path. Add a paragraph immediately after
the second-rejection fallback paragraph from Edit 1, before the Reset-path
heading.

**Insertion text:**

> **If `git rebase origin/main` in substep 3 conflicts**, apply the same
> conflict-handling rules as Step 1: the conflict shape here is similar —
> small documentation, list, or changelog collisions between two streams of
> work merging into main — and the same mechanical-vs-substantive
> distinction applies.
>
> Resolve mechanical conflicts inline, then `git -C "$MAIN_REPO" add
> <files>` and `git rebase --continue`, then proceed to substep 4.
> Mechanical cases are the same as Step 1: unrelated edits in adjacent
> regions (keep both), the same logical change landed on both sides (drop
> the local-only duplicate; take origin's version), both sides appended
> different items to the same list/changelog/docs section (merge the
> content).
>
> Abort and exit non-zero only when both sides made substantive
> contradicting changes to the same logic, when a file was deleted on one
> side and modified on the other, or when the right answer isn't obvious
> without operator context. On abort: `git rebase --abort` (local main
> lands back at `$PRE_MERGE_SHA`; feature commits remain reachable via
> `$FEATURE_BRANCH`), then exit non-zero with a diagnostic naming
> `$PRE_MERGE_SHA`. The operator investigates and re-runs `/close-issue`.

### Edit 3 — Step 1: forward-link to the Retry path's invariant preservation

**File:** `.claude/skills/close-branch/SKILL.md`

**Section:** Step 1 ("Rebase onto latest main"), the existing rationale
paragraph that begins "Rebase onto **local** `main`, not `origin/main`."
(currently line 75).

**Change:** append a single sentence at the end of that paragraph.

**Append text:**

> The Retry path in Step 3 preserves this same invariant: when a push
> rejection forces a rewind, it rewinds to `$PRE_MERGE_SHA` (which includes
> any unpushed direct-to-main commits) rather than to `origin/main` (which
> would orphan them).

This tie-back is one of two anti-regression guards. The other is Edit 4
below, which annotates the historical spec so a future implementer cannot
silently lift the broken `git reset --hard origin/main` snippet from there.

### Edit 4 — Historical spec: in-line deprecation annotation on the bug snippet

**File:** `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`

**Section:** Section "Step 3 — Push", numbered list item 6, the **Retry
path** sub-bullet (currently line 143).

**Rationale:** the historical spec contains the buggy `git reset --hard
origin/main` verbatim and is grep-discoverable. A future contributor or
autonomous session searching for the retry mechanics may read that bullet,
copy the command, and miss the live skill's correction. The forward-link
sentence in Edit 3 lives in a different section of a different file and
cannot be relied upon to surface during a grep-then-lift workflow. An
in-line annotation immediately above the bullet attaches the deprecation
warning to the exact line that would otherwise be copied.

**Insertion:** add a blockquote immediately *before* the bullet that
begins `- **Retry path** (preferred)`. Do not modify the bullet's text
itself; the historical record of what was decided at ENG-213 time is
preserved, with the post-ENG-257 correction surfaced alongside it.

**Insertion text:**

```markdown
   > **DEPRECATED — Updated by ENG-257 (2026-04-26):** the `git reset
   > --hard origin/main` in the Retry path bullet below was identified as
   > orphaning unpushed direct-to-main commits and was replaced in the
   > live skill. **Do not copy this command** into new code or docs. The
   > current correct behavior lives in `.claude/skills/close-branch/SKILL.md`
   > Step 3 and is specified in `docs/specs/close-branch-retry-preserves-local-main.md`.
   > This historical bullet is preserved as a record of the ENG-213 design
   > decision; it is not the current behavioral spec.
```

The leading three-space indent matches the surrounding bullet's nesting
depth so the blockquote renders inside the bullet's scope. No other text
in `2026-04-23-close-issue-close-branch-split.md` is changed.

## Why `reset --hard "$PRE_MERGE_SHA"` is safe

Captured for posterity since the destructive verb may raise eyebrows in
review. `reset --hard <SHA>` moves a branch ref + working tree to `<SHA>`;
it does not destroy the old commits, which remain in the object database
and are reachable via `git reflog` for ~30+ days, and via any other ref
that still points at them.

At the moment of the new substep 2 reset, the state is:

- `local main` = original `origin/main` + unpushed direct-to-main commits +
  feature ff-merge commits.
- `$FEATURE_BRANCH` ref points at the same feature commits (Step 1 rebased
  feature onto local main; Step 2's ff-merge then advanced main to match).
- `$PRE_MERGE_SHA` = original `origin/main` + unpushed direct-to-main
  commits (the post-pull, pre-ff-merge tip captured at Step 2 line 110).

After `git reset --hard "$PRE_MERGE_SHA"`:

- `main` = `$PRE_MERGE_SHA` (preserves the unpushed direct-to-main commits
  on a branch ref).
- `$FEATURE_BRANCH` ref unchanged (still reaches the feature commits).
- No commits are unreachable from any ref.

This is *less* destructive than the existing buggy `git reset --hard
origin/main`, which leaves the unpushed direct-to-main commits reachable
only via reflog.

**Note on the second-rejection fallback's *different* reset target.** The
fallback added by Edit 1 uses `git reset --hard origin/main` — *not*
`$PRE_MERGE_SHA`. That asymmetry is intentional. Substep 2 above happens
*inside* the Retry path with the explicit intent to immediately re-rebase
and re-push, so divergence between local main and origin/main during the
Retry attempt is acceptable (it's the ephemeral working state of the
recovery). The fallback fires *on the way out* of the skill — at that
point any local-vs-origin divergence becomes a force-push hazard, so the
fallback resets to `origin/main` to eliminate it. Sean's work is preserved
on `$FEATURE_BRANCH` instead of on `main`. See the second-rejection
fallback paragraph in Edit 1 for the full state-after-fallback.

## Out of scope

- **Step 2's `git pull --ff-only origin main`** — no change. `--ff-only`
  is already safe; any divergence between local main and origin/main fails
  the pull loudly rather than rewriting history.
- **The existing Reset path** (current line 138, `git reset --hard
  "$PRE_MERGE_SHA"`) — has the same divergence flaw as the original Retry
  path whenever Sean has unpushed direct-to-main commits at close-issue
  invocation time. Codex review of this spec surfaced the flaw; aligning
  the Reset path with this spec's second-rejection fallback (which resets
  to `origin/main` instead of `$PRE_MERGE_SHA`) is tracked as **ENG-304**
  and is intentionally out of scope here. ENG-257's scope is the Retry
  path's reset target; ENG-304 covers the Reset path's reset target. The
  two are filed separately because they were surfaced separately and
  because the Reset path predates ENG-257 (the flaw was always latent
  there).
- **Other skills in `agent-config/` or in the `sensible-ralph` plugin** —
  no other live skill uses `git reset --hard origin/main` after a feature
  ff-merge. Verified by `grep -rn "reset --hard origin/main"` across
  `.claude/`, `agent-config/`, and the `sensible-ralph` plugin cache during
  spec authoring; the only other match is in the historical design spec
  `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
  (line 143), which Edit 4 annotates with an in-line deprecation warning
  pointing to the live skill. The historical bullet's text itself is *not*
  rewritten — preserving the historical record of the ENG-213 decision —
  but the annotation immediately above it makes the post-ENG-257
  correction visible to anyone reading or grepping the bullet.
- **Automated tests for the Retry path** — `close-branch` is a
  prose/markdown skill, not a script; the existing convention is
  operator-driven dogfooding for git-state behaviors. The bug rule's TDD
  requirement does not apply to documentation edits with no runtime
  behavior of their own.
- **Hardening other steps for hypothetical race conditions** — the bug is
  scoped to the Retry path's reset target. Do not refactor unrelated steps.
- **Renumbering, restructuring, or reflowing the rest of the skill** — only
  the four edits above (three in the live skill, one annotation in the
  historical spec). Step headings, substep numbering elsewhere, prose in
  unrelated sections all unchanged.

## Verification

This is a documentation change to a markdown skill that contains bash
recipes. The bash itself isn't executed by a test harness; it is followed
by a Sonnet-driven Skill invocation in the close-issue ritual. Verification
is therefore prose-correctness plus operator-driven dogfooding when a real
push race occurs.

**TDD exception (Rule #1).** The user-global rule "FOR EVERY NEW FEATURE OR
BUGFIX, YOU MUST follow Test Driven Development" presupposes testable
runtime behavior. A markdown skill with embedded bash recipes is prose; the
correctness check is whether the prose accurately specifies the intended
git operations. Sean granted this exception explicitly during spec
authoring on 2026-04-26. No tests are required, and no test failures will
result from this commit.

**Verification steps:**

1. Read the edited `.claude/skills/close-branch/SKILL.md` Step 3 Retry
   path. Confirm:
   - The numbered substep list has six entries (was five).
   - Substep 2 reads `git reset --hard "$PRE_MERGE_SHA"` (not
     `git reset --hard origin/main`).
   - Substep 3 reads `git rebase origin/main` and points the reader at the
     "If `git rebase origin/main` in substep 3 conflicts" paragraph below
     the list.
   - Substeps 4–6 are the renumbered equivalents of the old substeps 3–5
     and are textually unchanged otherwise.
2. Confirm the **second-rejection fallback paragraph** (added by Edit 1)
   appears immediately after the numbered substep list, before the
   conflict-handling paragraph. Confirm:
   - It explicitly says the Retry path is single-attempt.
   - The fallback's reset target is `origin/main` (NOT `$PRE_MERGE_SHA`),
     fetched fresh via `git fetch origin main` immediately before the reset.
   - The post-fallback state is described: local main matches origin
     exactly (no divergence, no force-push hazard); `$FEATURE_BRANCH`
     preserves both the replayed direct-to-main commits and the rebased
     feature commits.
   - The recovery is "operator re-runs `/close-issue`" — Step 1 will
     replay the preserved commits onto the new origin tip naturally. No
     manual cherry-picking is required.
   - The note about ENG-304 is present, explaining that the existing
     Reset path has the same divergence flaw and that aligning it is
     out of scope for ENG-257.
3. Confirm the **rebase conflict-handling paragraph** (Edit 2) appears
   immediately after the second-rejection fallback paragraph, before the
   Reset-path heading. Confirm it inherits Step 1's mechanical-resolution
   rules (formatting/adjacent-region/list-append → resolve inline; same
   logical change on both sides → drop local-only duplicate; substantive
   contradicting changes / file deleted vs modified / non-obvious decisions
   → abort and exit). Confirm the abort path lands main back at
   `$PRE_MERGE_SHA` with feature commits reachable via `$FEATURE_BRANCH`.
4. Read the edited Step 1 rationale paragraph. Confirm the appended
   sentence (Edit 3) references `$PRE_MERGE_SHA` and the Retry path. Confirm
   no other text in the paragraph changed.
5. Read `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
   around line 143. Confirm:
   - The annotation blockquote (Edit 4) appears immediately above the
     `- **Retry path** (preferred):` bullet, indented to the same depth as
     the bullet (3 spaces).
   - The annotation references ENG-257, names `git reset --hard origin/main`
     as the bug-prone command, and points at `.claude/skills/close-branch/SKILL.md`
     and `docs/specs/close-branch-retry-preserves-local-main.md` as the
     current source of truth.
   - The Retry-path bullet's text itself is unchanged from its current
     content; only the annotation above it is new.
   - No other content in `2026-04-23-close-issue-close-branch-split.md`
     is modified.
6. Confirm no other section, heading, code block, or substep elsewhere in
   `.claude/skills/close-branch/SKILL.md` was modified.
7. Optional (not required for sign-off): mentally trace the new substep
   sequence against the bug's repro scenario (local main = A+B+C+feature,
   origin/main races to A+X+Y) and confirm the end state is
   A+X+Y+B'+C'+feature' on main with no commits orphaned. Then trace the
   double-race case (substep 6 also rejected; origin/main now A+X+Y+Z) and
   confirm the fallback reaches: `local main = A+X+Y+Z` (matches origin
   exactly, no divergence), `$FEATURE_BRANCH = A+X+Y+B'+C'+F's` (work
   preserved on the feature ref), exit non-zero. Then confirm the operator's
   `/close-issue` re-run from this state succeeds: Step 1 rebases
   feature_branch's B', C', F's onto local main = A+X+Y+Z, producing
   A+X+Y+Z+B''+C''+F''s; Step 2 ff-merges; Step 3 push succeeds (no further
   race).

## Files touched

- `.claude/skills/close-branch/SKILL.md` (one numbered list rewritten in
  Step 3, two paragraphs inserted in Step 3 — second-rejection fallback
  and rebase conflict-handling — and one sentence appended in Step 1).
- `agent-config/docs/specs/2026-04-23-close-issue-close-branch-split.md`
  (one annotation blockquote inserted above the Retry-path bullet near
  line 143; bullet text itself unchanged).

Spec doc itself (`docs/specs/close-branch-retry-preserves-local-main.md`)
is committed separately as part of the spec workflow, not by this fix.

## Prerequisites

None. Self-contained edits to two files (the live skill and one
historical spec annotation).

## Commit shape

Single commit, docs-only.

Suggested message:

```
fix(close-branch): retry path preserves unpushed local-main commits

Ref: ENG-257
```
