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

Three narrowly-scoped edits to one file: `.claude/skills/close-branch/SKILL.md`.

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
   common case (no unpushed commits), this is a no-op fast-forward. **If
   conflicts arise:** see the conflict-policy paragraph added by Edit 2.
4. Re-run Step 1 on the worktree (rebase onto the now-fresh local main,
   which equals the new origin/main plus any replayed direct-to-main
   commits).
5. Re-run Step 2 (capture a fresh `$PRE_MERGE_SHA`, ff-merge).
6. Re-run the push.

The substep numbering shifts by one; substeps 4–6 are textually identical
to the old substeps 3–5 modulo the renumber.

### Edit 2 — Step 3 Retry path: conflict-handling paragraph

**File:** `.claude/skills/close-branch/SKILL.md`

**Section:** Step 3 ("Push"), Retry path. Add a paragraph immediately after
the new numbered substep list, before the Reset-path heading.

**Insertion text:**

> **If `git rebase origin/main` in substep 3 conflicts** — the unpushed
> direct-to-main commits collide substantively with the commits a
> collaborator pushed — `git rebase --abort` and exit non-zero with a
> diagnostic naming `$PRE_MERGE_SHA`. Local main lands back at
> `$PRE_MERGE_SHA` (= the pre-ritual local state with unpushed commits
> intact); feature commits remain reachable via `$FEATURE_BRANCH`. The
> operator investigates and re-runs `/close-issue`.
>
> Step 1's mechanical-resolution carve-outs (formatting, list appends, etc.)
> deliberately do NOT apply to this rebase. Step 1 reconciles feature work
> designed to land on main; this rebase reconciles two streams of
> *direct-to-main* work from different humans. A conflict here is a
> substantive signal worth a human look — not a mechanical merge.

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

This tie-back prevents a future contributor from "simplifying" the Retry
path back to `git reset --hard origin/main` without understanding the
invariant the captured `$PRE_MERGE_SHA` exists to preserve.

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

## Out of scope

- **Step 2's `git pull --ff-only origin main`** — no change. `--ff-only`
  is already safe; any divergence between local main and origin/main fails
  the pull loudly rather than rewriting history.
- **The Reset path fallback** (current line 138, `git reset --hard
  "$PRE_MERGE_SHA"`) — already correct. The fix uses the same target SHA
  in the Retry path, achieving symmetry; no change to the Reset path text
  itself.
- **Other skills in `agent-config/` or in the `sensible-ralph` plugin** —
  no other location uses `git reset --hard origin/main` after a feature
  ff-merge. Verified by `grep -r "reset --hard" .claude/ agent-config/`
  during spec authoring; no other instances of the same anti-pattern.
- **Automated tests for the Retry path** — `close-branch` is a
  prose/markdown skill, not a script; the existing convention is
  operator-driven dogfooding for git-state behaviors. The bug rule's TDD
  requirement does not apply to documentation edits with no runtime
  behavior of their own.
- **Hardening other steps for hypothetical race conditions** — the bug is
  scoped to the Retry path's reset target. Do not refactor unrelated steps.
- **Renumbering, restructuring, or reflowing the rest of the skill** — only
  the three edits above. Step headings, substep numbering elsewhere, prose
  in unrelated sections all unchanged.

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
   - Substep 3 reads `git rebase origin/main` and is followed by a
     reference to the conflict-handling paragraph.
   - Substeps 4–6 are the renumbered equivalents of the old substeps 3–5
     and are textually unchanged otherwise.
2. Confirm the conflict-handling paragraph (Edit 2) appears immediately
   after the numbered substep list, before the Reset-path heading. Confirm
   it explicitly states the abort-and-exit policy and explicitly notes the
   asymmetry with Step 1's mechanical-resolution carve-outs.
3. Read the edited Step 1 rationale paragraph. Confirm the appended
   sentence (Edit 3) references `$PRE_MERGE_SHA` and the Retry path. Confirm
   no other text in the paragraph changed.
4. Confirm no other section, heading, code block, or substep elsewhere in
   the skill was modified.
5. Optional (not required for sign-off): mentally trace the new substep
   sequence against the bug's repro scenario (local main = A+B+C+feature,
   origin/main races to A+X+Y) and confirm the end state is
   A+X+Y+B'+C'+feature' on main with no commits orphaned.

## Files touched

- `.claude/skills/close-branch/SKILL.md` (one numbered list rewritten in
  Step 3, one paragraph inserted in Step 3, one sentence appended in Step
  1).

No other files. Spec doc itself (`docs/specs/close-branch-retry-preserves-local-main.md`)
is committed separately as part of the spec workflow, not by this fix.

## Prerequisites

None. Self-contained edit to one file in `.claude/skills/`.

## Commit shape

Single commit, docs-only.

Suggested message:

```
fix(close-branch): retry path preserves unpushed local-main commits

Ref: ENG-257
```
