# Handle never-pushed feature branches in `close-feature-branch` Step 5

ENG-238 · Agent Config

## Problem

`.claude/skills/close-feature-branch/SKILL.md` Step 5 ("Delete the feature branch") runs both commands unconditionally:

```bash
git branch -d "$FEATURE_BRANCH"
git push origin --delete "$FEATURE_BRANCH"
```

For branches created by the ralph orchestrator, the feature branch is **local-only** — the orchestrator commits and builds on the branch without ever pushing it to `origin`. Content reaches `main` via the fast-forward merge in Step 2 and the subsequent `git push origin main` in Step 3; the remote feature ref never exists. `git push origin --delete` on a ref that was never pushed fails:

```
error: unable to delete '<branch>': remote ref does not exist
error: failed to push some refs to 'github.com:<owner>/<repo>.git'
```

The Bash command exits 1. The overall ritual currently only continues because the agent's narrative interprets the output and proceeds anyway. The skill as written doesn't anticipate this case — Step 5's prose only warns about the local `-d` delete refusing to delete an unmerged branch, never about the remote delete failing.

Observed during ENG-208 close (transcript: `~/Documents/claude_convo/2026-04-23-075828-command-messageralph-startcommand-message.txt`, lines 316-330). With more autonomous closes coming, relying on agent narrative to paper over a non-zero exit is fragile — a stricter automation wrapper or a future ralph-close variant that fails the whole ritual on any step's non-zero exit would block legitimate closes.

## Approach

Gate the remote delete on an `ls-remote` check. If the ref exists on `origin`, delete it as before. If it doesn't, skip with a note so the operator sees the decision.

### Step 5 code change

Replace the current Step 5 code block with:

```bash
git branch -d "$FEATURE_BRANCH"
if git ls-remote --exit-code --heads origin "$FEATURE_BRANCH" >/dev/null 2>&1; then
  git push origin --delete "$FEATURE_BRANCH"
else
  echo "remote ref for $FEATURE_BRANCH does not exist on origin — skipping remote delete (local-only branch)"
fi
```

`git ls-remote --exit-code --heads` returns 0 when the ref exists, 2 when it doesn't, and other codes on network/auth failure. The `>/dev/null 2>&1 && ... || ...` form conflates "not found" with "error", which is acceptable here because Step 5 is reached only after Steps 2 (`git pull --ff-only origin main`) and 3 (`git push origin main`) have already succeeded — network to `origin` is known reachable. A stricter case-statement on exit code adds complexity for a failure mode that cannot occur at this point.

### Step 5 prose update

The current Step 5 opening sentence — "With the branch no longer checked out anywhere, delete it locally and on the remote" — implies the remote delete is mandatory. It needs to become explicitly conditional, and the "local-only feature branch" case needs to be named so a future reader understands why the gate exists.

Rewrite the section's prose (before the code block) to:

> With the branch no longer checked out anywhere, delete it locally. Then delete it on the remote — **but only if it was ever pushed there**. Ralph-dispatched branches are built and merged without ever being pushed to `origin`; the content reaches `main` via Step 2's fast-forward merge and Step 3's push of `main`. For those branches the remote feature ref doesn't exist, and `git push origin --delete` would fail. Check with `git ls-remote` and skip the remote delete when the ref is missing.

Keep the existing trailing sentence about `-d` versus `-D` unchanged:

> Use `-d` (safe delete), not `-D` (force delete). If `-d` refuses because the branch isn't merged, something went wrong with the rebase/merge — investigate before escalating to `-D`.

### No other changes

- Steps 1–4, 6, 7 are unchanged.
- The "Red Flags / When to Stop" section is unchanged; `-d` refuses is still a stop condition, and the remote delete is now conditional rather than a new stop condition.
- No changes outside `.claude/skills/close-feature-branch/SKILL.md`.

## Acceptance criteria

1. Closing a never-pushed ralph-dispatched feature branch completes Step 5 with a zero exit code. The local branch is deleted (`git branch -d`), the remote delete is skipped, and a line like `remote ref for <branch> does not exist on origin — skipping remote delete (local-only branch)` is printed.
2. Closing a previously-pushed feature branch still deletes the remote ref (regression check — the `ls-remote` gate must not block the existing behavior).
3. Step 5's prose in `.claude/skills/close-feature-branch/SKILL.md` explicitly acknowledges the "local-only feature branch" case, names ralph-dispatched branches as the canonical example, and explains why the remote delete must be conditional.

## Verification

There is no bats harness for `close-feature-branch` — the skill is prose the agent executes against a live git repo and Linear workspace. Verification is through end-to-end exercise of both branches of the gate:

- **Local-only branch:** at the next close of a ralph-dispatched issue, confirm Step 5 exits 0 and prints the skip note. The branch must not exist on `origin` before the close (`git ls-remote --heads origin <branch>` returns 2). After close, the local branch is gone.
- **Previously-pushed branch:** on a hand-created feature branch that was pushed to `origin` (or a throwaway created and pushed for the regression check), confirm Step 5 deletes both the local branch and the remote ref, matching pre-change behavior.

Both cases must be exercised before declaring the fix complete. If only the local-only case is tested, the regression path isn't covered.

## Out of scope

- Adding a bats harness for `close-feature-branch`. The skill is prose-driven; a harness is a separate, larger project not warranted by this fix.
- Changes to Steps 1–4, 6, or 7 of the ritual.
- Parameterizing `origin` or `main` in the skill. `close-feature-branch` is project-local and hardcodes both by design.
- The related untracked-ralph-artifacts gap mentioned in the ENG-238 ticket. Independent fix, tracked separately.
- Distinguishing `ls-remote` exit code 2 ("not found") from other non-zero exits ("network/auth error") in Step 5. See the Approach note — unreachable at this point in the ritual.

## Implementation note (post-spec)

This spec was written against `close-feature-branch`. ENG-213 (landed 2026-04-23, one day after this spec was approved) split that skill into:

- `agent-config/skills/close-issue/` — global, Linear-side
- `.claude/skills/close-branch/` — project-local, VCS-side

The branch-delete step moved to `close-branch` **Step 6** (formerly close-feature-branch Step 5; ENG-213 inserted a "Detach HEAD in the worktree" step before it). The fix described in this spec was retargeted accordingly — the ls-remote gate and prose rewrite landed in `.claude/skills/close-branch/SKILL.md` Step 6, not in `close-feature-branch/SKILL.md` Step 5. The code and rationale are identical; only the file path and step number changed.
