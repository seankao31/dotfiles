# Split `close-feature-branch` into global `close-issue` + project-local `close-branch`

**Status:** Approved (ENG-213)
**Project:** Agent Config
**Date:** 2026-04-23

## Motivation

`close-feature-branch` was scoped project-local under the assumption that branching/merge strategies vary per project. That reasoning still holds for the git-integration parts, but the skill has grown to 478 lines and accreted content that isn't actually project-specific:

- Linear state preflight (`In Review` check)
- Linear blocker preflight (ENG-207 — which sources `agent-config/skills/ralph-start/scripts/lib/linear.sh`, a cross-`.claude/` ↔ `agent-config/` boundary)
- Worktree hygiene and untracked-file preservation
- Linear Done transition
- Worktree removal and codex broker reap (ENG-221)
- Stale-parent child labeling (ENG-208)
- Main-checkout-CWD invariant

These concerns belong to any project that uses Linear + ralph worktrees, not just chezmoi. ENG-207's cross-skill source made the boundary violation concrete; this split dissolves it.

## Design

### Boundary

Two skills, one invariant-only interface:

- **`close-issue`** (global, installed to `~/.claude/skills/close-issue/` via chezmoi's `agent-config/skills/close-issue/`): Linear-side ritual and ralph-workflow infrastructure. Invokes `close-branch` for VCS integration.
- **`close-branch`** (project-local, at `.claude/skills/close-branch/`): every VCS decision — rebase onto what, merge how, push where, keep or delete the branch. Each project using ralph provides its own `close-branch`; chezmoi's ships with the refactor.

### Invariant vs variant inventory

**Invariant (stays in `close-issue`):**

| Concern | Why invariant |
|---|---|
| Main-checkout-CWD check (`.git` is dir, not file) | Ralph workflow uses worktrees universally; session must not run from a worktree close-branch might destroy. |
| Linear state preflight (state == `$RALPH_REVIEW_STATE`) | Issue lifecycle is Linear-defined, not project-defined. |
| Linear blocker preflight (`linear_get_issue_blockers`, all `$RALPH_DONE_STATE`) | Ralph-v2 merge-ordering invariant. |
| Branch + worktree resolution (`ISSUE_ID` → `FEATURE_BRANCH` → `WORKTREE_PATH`) | Ralph-wide convention: branches follow Linear's lowercase-slug or `.branchName`, worktrees are discoverable via `git worktree list --porcelain`. |
| Untracked-file preservation | Data-safety gate before any worktree mutation. |
| Stale-parent child labeling (conditional on `INTEGRATION_SHA`) | Linear writes only, informational; ralph-v2 concern, not project-specific. |
| Linear Done transition (via `linear-workflow`) | Issue lifecycle. |
| Codex broker reap + worktree removal | Claude Code / ralph infrastructure, paired with worktree destruction. |

**Variant (lives in `close-branch`):**

| Concern | Why variant |
|---|---|
| Uncommitted-tracked-change hygiene check | Precondition for the rebase step; what "clean enough to rebase" means is project-specific. |
| Rebase onto base branch | Base branch (main / dev / release) is per-project. |
| Mechanical rebase-conflict resolution rules | Project's tolerance for auto-resolution differs. |
| Merge strategy (ff vs no-ff) | Project convention. |
| Push strategy (direct, PR, none) | Project convention. |
| Detach HEAD before branch delete | Prereq specifically for the delete step. |
| Branch deletion policy (delete / keep) | Project convention. |

### Interface contract

`close-issue` invokes `close-branch` via the Claude Code `Skill` tool with the following contract (agent-driven composition; the markdown is the "contract").

**`close-issue` → `close-branch`:**
- `ISSUE_ID` — Linear issue identifier (for logging and project-local branch-name fallback).
- `FEATURE_BRANCH` — resolved by close-issue.
- `WORKTREE_PATH` — resolved by close-issue.

Inputs are passed symmetrically with the return channel: `close-issue` writes `$MAIN_REPO/.close-branch-inputs` (single-quoted `KEY='VALUE'` format, gitignored) before invoking `Skill(close-branch)`. `close-branch` sources and deletes the file at entry. This matches the return channel's rationale — shell `export` is unreliable across Skill-tool invocation boundaries, so both directions of the contract use a file.

close-branch can assume on entry:
- CWD is the main checkout (`close-issue` verified `.git` is a directory).
- Linear issue is in `$RALPH_REVIEW_STATE` with all blockers `$RALPH_DONE_STATE`.
- Untracked files in `$WORKTREE_PATH` have been handled by close-issue (preserved or explicitly discarded).
- `$MAIN_REPO/.close-branch-inputs` exists and contains the three inputs above.

**`close-branch` → `close-issue` (on success):**
- `INTEGRATION_SHA` — git SHA where the reviewed work now lives (e.g., new `main` HEAD after ff-merge). Empty if the project's integration doesn't yet produce a landed SHA (e.g., PR-pending workflows).
- `INTEGRATION_SUMMARY` — human-readable one-liner for the final user-facing message (`"merged to main @ abc1234 and pushed"`, `"PR opened: https://…"`, etc.).

**Return channel: result file.** Bash `export` is scoped to its subprocess and is not visible across Skill-tool invocation boundaries. Return values are passed via a file at `$MAIN_REPO/.close-branch-result` in shell-sourceable `KEY='VALUE'` format (values MUST be single-quoted — an unquoted `INTEGRATION_SUMMARY=merged to main @ ...` would parse as `VAR=VALUE cmd args`, leaving the summary unset and emitting a command-not-found error when close-issue `source`s the file):

```
INTEGRATION_SHA='abc1234...'
INTEGRATION_SUMMARY='merged to main @ abc1234 and pushed'
```

close-branch writes this file as its last step on success (after branch delete). close-issue sources it immediately after the Skill invocation returns, then deletes it. close-issue also deletes any pre-existing `.close-branch-result` *before* invoking close-branch — without that cleanup, a PR-pending close-branch (which writes no file) would cause the subsequent source to read a stale file left over from a previously interrupted run, contaminating stale-parent labeling and the final message with the previous issue's integration SHA. `.close-branch-result` must be added to `.gitignore`. If the file is absent when close-issue reads (e.g., close-branch succeeded but did not produce a SHA — PR-pending), close-issue treats both values as empty and skips stale-parent.

**`close-branch` → `close-issue` (on failure):**
- Non-zero exit with a clear diagnostic on stderr.
- close-issue does no cleanup on failure — partial state is close-branch's concern to report; the operator decides recovery. In particular: Linear Done transition, stale-parent labeling, and worktree removal are **not** run on close-branch failure.

### `close-issue` structure

Global skill at `agent-config/skills/close-issue/SKILL.md`.

Frontmatter:
- `name: close-issue`
- `description: ` — describes the Linear-ritual framing; references the project-local `close-branch` dependency.
- `argument-hint: <issue-id>`
- `allowed-tools: Skill, Bash, Read, Glob, Grep`

Body sections in execution order:

1. **When to use** — post-review, for an issue in `$RALPH_REVIEW_STATE`. Points at `ralph-v2-usage.md`.
2. **Invocation** — `/close-issue ENG-NNN` from the main checkout.
3. **Main-checkout-CWD invariant** — verify `.git` is a directory (not a file); refuse if inside a linked worktree.
4. **Source ralph-start libs** — from `$HOME/.claude/skills/ralph-start/scripts/lib/` (not `$MAIN_REPO/agent-config/...`). Sources `config.sh`, which transitively sources `linear.sh`; also sources `branch_ancestry.sh` explicitly.
5. **Resolve `FEATURE_BRANCH` and `WORKTREE_PATH`** — via `resolve_branch_for_issue` with Linear `.branchName` fallback, then `git worktree list --porcelain`. Stop with a diagnostic if either resolution fails.
6. **Linear state preflight** — must be `$RALPH_REVIEW_STATE`. Disposition map for other states identical to today's Pre-flight §1.
7. **Linear blocker preflight** — `linear_get_issue_blockers`, capture-then-filter pattern with jq shape guard (identical to today's Pre-flight §2).
8. **Untracked-file preservation** — `git -C "$WORKTREE_PATH" ls-files --others --exclude-standard`; for each file, prompt operator (commit / copy out / discard). Never silently discard.
9. **Invoke `close-branch`** — Skill tool call with the three inputs. On non-zero exit, print the diagnostic and stop. No cleanup runs on failure; the operator decides recovery.
10. **Read result file** — source `$MAIN_REPO/.close-branch-result` if it exists (sets `$INTEGRATION_SHA` and `$INTEGRATION_SUMMARY`), then delete it. If absent, both values are empty.
11. **Stale-parent labeling (§3.5)** — skip entirely if `$INTEGRATION_SHA` is empty. Otherwise: verify label exists, walk Linear `blocks` children in `$RALPH_REVIEW_STATE`, use `is_branch_fresh_vs_sha "$INTEGRATION_SHA"` to detect stale, label+comment via `stale_label_and_comment` helper. Logic identical to today's Step 3.5; accumulated warnings printed immediately.
12. **Linear Done transition** — invoke `linear-workflow` with `$ISSUE_ID`, request `In Review → Done`.
13. **Codex broker reap + worktree removal** — identical to today's Step 7. Worktree removal runs last so CWD at `$MAIN_REPO` remains stable throughout.
14. **Final message** — print `$INTEGRATION_SUMMARY` if set, otherwise a generic "`$ISSUE_ID` closed" line.
14. **Red flags / stop conditions** — Linear preflight failures, close-branch failure, branch not resolvable, worktree-remove failure (never `--force`).

### `close-branch` structure (chezmoi's implementation)

Project-local skill at `.claude/skills/close-branch/SKILL.md` — replaces today's `close-feature-branch`.

Frontmatter:
- `name: close-branch`
- `description: ` — chezmoi-specific, notes it's invoked by `close-issue` (not a user entry point).
- `argument-hint: <issue-id>` (passed through from close-issue).
- `allowed-tools: Bash, Read, Glob, Grep` (no `Skill` — close-branch invokes no other skills).
- `user-invocable: false` — hides close-branch from the `/` menu so a human can't accidentally type `/close-branch` instead of `/close-issue`. The description discourages autonomous auto-pick; explicit `Skill(close-branch)` dispatch from close-issue remains the only intended entry path.

`disable-model-invocation: true` was considered but rejected: it blocks *all* model invocation including explicit `Skill(name)` dispatch from another skill, which breaks the intended dispatch contract. A skill should be dispatched as a skill, not read inline as a markdown doc.

Body sections in execution order:

1. **When to use** — called by `close-issue`, not invoked directly by the user.
2. **Inputs on entry** — `ISSUE_ID`, `FEATURE_BRANCH`, `WORKTREE_PATH`, sourced from `$MAIN_REPO/.close-branch-inputs` (single-quoted `KEY='VALUE'` format, written by close-issue, deleted here after read). CWD is the main checkout.
3. **Uncommitted-tracked-change gate** — `git -C "$WORKTREE_PATH" status --short`; any non-`??` line aborts (current §3).
4. **Rebase onto local main** — current Step 1 verbatim, including mechanical-conflict-resolution rules and abort criteria.
5. **Verify main-checkout clean + ff-merge** — current Step 2. Before running `git merge --ff-only`, capture a safety ref:
   ```bash
   PRE_MERGE_SHA=$(git rev-parse main)
   ```
6. **Push** — current Step 3, with a strengthened invariant: close-branch must not exit while local main is ahead of `origin/main`. Two compliant exit paths after a push rejection:
   - **Retry path** (preferred): `git fetch origin main` → `git reset --hard origin/main` on local main → re-run Step 4 (rebase onto refreshed local main) → re-run Step 5 → re-run push. The explicit fetch is required because a rejected push does not reliably update the local `origin/main` tracking ref, and resetting to the stale ref would leave the worktree rebase based on an ancestor of the eventual ff-merge target.
   - **Reset path** (if retry is not recoverable by close-branch): `git reset --hard "$PRE_MERGE_SHA"` to restore local main to its pre-merge state, then exit non-zero with a clear diagnostic for the operator.
   
   If neither path can be completed cleanly, escalate to the operator. **Never exit non-zero while local main contains the feature commits but origin/main does not.**
7. **Capture return values** — immediately after successful push, before any cleanup:
   ```bash
   INTEGRATION_SHA=$(git rev-parse HEAD)
   INTEGRATION_SUMMARY="merged to main @ $(git rev-parse --short HEAD) and pushed"
   ```
8. **Detach HEAD in worktree** — current Step 4.
9. **Delete branch locally + remote** — current Step 5, `-d` not `-D`.
10. **Write result file** — last step on success, after branch delete. Values MUST be single-quoted (see Interface contract above for why):
    ```bash
    {
      printf "INTEGRATION_SHA='%s'\n" "$INTEGRATION_SHA"
      printf "INTEGRATION_SUMMARY='%s'\n" "$INTEGRATION_SUMMARY"
    } > "$MAIN_REPO/.close-branch-result"
    ```
    close-issue reads and deletes this file after the Skill invocation returns. On failure at any earlier step, close-branch exits non-zero without writing the file — close-issue treats absent file as empty values.
10. **Red flags / stop conditions** — rebase-conflict escalation criteria, push-rejection recovery, `-d` refusal (investigate rather than `-D`).

**Removed from today's skill (moved to close-issue):**
- Main-checkout-CWD verification.
- Linear state preflight.
- Linear blocker preflight.
- Untracked-file preservation preflight.
- Stale-parent labeling (old §3.5).
- Linear Done transition.
- Codex broker reap + worktree removal.

**Stays chezmoi-specific (documented in skill prose):**
- Hard-coded `main` base branch.
- Rebase-onto-local-main rationale (local unpushed commits).
- Direct-to-main push model (no PR).
- `-d`-not-`-D` discipline.
- `.worktrees/<slug>/` convention.

### Cross-skill library sourcing

Post-split, only `close-issue` sources ralph-start's helpers — `close-branch` doesn't need any (its sections are pure git operations, with Linear state names no longer referenced). `close-issue`'s source paths switch from `$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/...` to `$HOME/.claude/skills/ralph-start/scripts/lib/...`. This treats ralph-start as an installed peer skill, not as content in the host repo — matches how `ralph-spec` already sources its dependencies. The cross-`.claude/` ↔ `agent-config/` boundary violation that motivated ENG-207's concern is dissolved: `close-branch` stops sourcing from `agent-config/` at all; `close-issue` itself lives under `agent-config/skills/`, so its sources are peer-local.

### Migration

One atomic changeset, in this order:

1. Create `agent-config/skills/close-issue/SKILL.md` with the full close-issue content (see **`close-issue` structure** above).
2. Rename `.claude/skills/close-feature-branch/` to `.claude/skills/close-branch/` via `git mv` (preserves SKILL.md's file history), then rewrite the SKILL.md inside with the reduced close-branch content (see **`close-branch` structure** above).
3. Grep the repo for any remaining `close-feature-branch` references and update to `close-issue`. Known targets:
   - `agent-config/CLAUDE.md`
   - User-global `~/.claude/CLAUDE.md` (installed from `dot_claude/symlink_CLAUDE.md.tmpl` or similar — trace the chezmoi source and update there).
   - `agent-config/skills/ralph-start/SKILL.md` ("When back" section mentions `/close-feature-branch ENG-NNN`).
   - `agent-config/docs/playbooks/ralph-v2-usage.md`.
   - Prior spec docs referencing the old skill name (do not retroactively rewrite historical specs — only update forward-looking playbooks and live documentation).
4. Update `.claude/settings.local.json` (chezmoi project-local): replace any `Skill(close-feature-branch)` entry with `Skill(close-issue)` and `Skill(close-branch)`. If neither was in the allowlist, add `Skill(close-issue)` so the user isn't prompted on first invocation.
5. Add `.close-branch-inputs` and `.close-branch-result` to `.gitignore` at the chezmoi repo root (both handoff files must not be committed).

### Portability / other-project guarantees

For a different project X to use `close-issue`, X must:

1. Have `ralph-start` installed globally at `~/.claude/skills/ralph-start/` (close-issue sources its libs from there).
2. Provide a skill named exactly `close-branch` at its `.claude/skills/close-branch/` (the name is part of the contract; close-issue invokes `Skill(close-branch)` without a discovery step).
3. Use ralph's worktree + Linear-lowercase-slug branch convention (ralph-workflow invariants).
4. Have `$RALPH_FAILED_LABEL` and `$RALPH_STALE_PARENT_LABEL` set up in its Linear workspace.

If X's `close-branch` leaves `$INTEGRATION_SHA` empty (e.g., the project opens a PR and doesn't merge), close-issue skips stale-parent labeling entirely — no breakage. Linear Done still transitions, and the final message uses whatever `$INTEGRATION_SUMMARY` X's close-branch provided.

**Known asymmetry.** Stale-parent uses ralph's default branch-naming convention (via `resolve_branch_for_issue`) to look up child branches for In-Review children of the closing issue. A project that overrides ralph's naming will see stale-parent gracefully skip each child via the existing "no local branch matching slug" WARN path — informational noise, no breakage. First-class support for custom child-branch lookup (e.g., close-branch returning a JSON payload of children) is explicitly out of scope for this refactor.

## Out of scope

- Moving `linear_get_issue_blockers` or other ralph-start libs to a shared-library location. Codex's ENG-207 adversarial review suggested this; treated as an orthogonal factoring decision about ralph-start's library layout.
- Generalizing `close-issue` to non-Linear issue trackers.
- Supporting PR-based workflows in *chezmoi's* `close-branch` (v1 keeps the direct-to-main push model; a PR-based project's close-branch would swap in its own integration logic).
- Start-side factoring — tracked separately as ENG-214 (parallel).
- First-class custom child-branch lookup for stale-parent across non-default-naming projects.
- A pre-invocation existence check for `close-branch` before close-issue invokes it — let the Skill tool's own error surface naturally.

## Alternatives considered

**Composition style.** Three flavors were weighed before settling on agent-driven:

- *Script-contract composition* — `close-branch` would ship a `scripts/run.sh` CLI that close-issue invokes as a subprocess and parses by exit code + structured stderr. Deterministic error-surfacing, but introduces a new executor pattern unique to this split. The rest of the repo treats skills as markdown playbooks, so this would be the only skill that behaves like a library. Rejected for consistency.
- *Hybrid* (markdown + scripts entrypoint) — same executor pattern as script-contract but keeps a SKILL.md for human readers. Rejected: the executor still dominates and the SKILL.md becomes documentation-only, defeating the skill abstraction.
- *Agent-driven* (chosen) — both ship SKILL.md, the agent follows close-issue's steps, invokes close-branch via the `Skill` tool at the handoff point, then continues close-issue's post-flight. Errors surface narratively; the "contract" is the SKILL.md. Matches every other skill in the repo.

**Interface shape.** Initial draft had close-issue passing `FEATURE_BRANCH`, `WORKTREE_PATH`, `MAIN_REPO` to close-branch. Sean pushed back: all three leak chezmoi conventions (slug-based branch naming, worktree presence, single-main-branch repo). Revised to `ISSUE_ID` only — close-branch resolves everything else from project conventions. Then, when close-issue's infra role (worktree remove, broker reap) was clarified, the interface was expanded to include `FEATURE_BRANCH` + `WORKTREE_PATH` resolved by close-issue itself — these are *ralph-invariants* (worktrees exist; naming follows ralph-start's convention), not project-specific leaks, so having them in the interface is safe as long as the "uses the whole ralph package" precondition holds.

**Boundary placement.** Uncommitted-tracked-change hygiene and untracked-file preservation were initially both proposed for close-branch (as preflights to the rebase). Untracked-preservation moved to close-issue because its real purpose is data-safety before close-issue's worktree-removal step, not rebase-safety. Uncommitted-tracked-changes stays in close-branch because it's a direct rebase precondition — if the worktree has staged/unstaged edits, rebase would fail or silently merge them.

**`INTEGRATION_SHA` as return shape.** A richer JSON payload (e.g., `{integration_sha, integration_summary, worktree_removed, branch_deleted}`) was considered and rejected as over-engineered — two shell variables are enough for every case in scope.

## Testing considerations

Implementation is not covered by automated tests in this skill repo; verification is operator-driven via dogfooding on a real ralph cycle. A reasonable smoke test for the implementation ticket:

- Close a small issue end-to-end using `/close-issue` and confirm all current ritual steps still happen in the same order (rebase, merge, push, stale-parent if applicable, Linear Done, worktree remove).
- Trigger a close-branch failure case (e.g., dirty worktree, pre-merge stage) and verify close-issue stops without transitioning Linear or touching the worktree.
- Simulate a push rejection after a successful ff-merge (e.g., manually advance origin/main before the push step) and verify close-branch either completes the retry path or resets local main to `$PRE_MERGE_SHA` before exiting non-zero — local main must not be left ahead of origin/main on exit.
- Close an issue with an In-Review child branch to exercise Step 3.5 (requires a ralph-v2 DAG test case — reuse whatever was set up for ENG-208).

Automated tests for `branch_ancestry.sh` and `linear.sh` helpers (under `agent-config/skills/ralph-start/scripts/test/`) are unaffected; they exercise the helpers directly, not via either skill.
