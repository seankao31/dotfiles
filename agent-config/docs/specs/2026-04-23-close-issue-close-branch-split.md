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

close-branch can assume on entry:
- CWD is the main checkout (`close-issue` verified `.git` is a directory).
- Linear issue is in `$RALPH_REVIEW_STATE` with all blockers `$RALPH_DONE_STATE`.
- Untracked files in `$WORKTREE_PATH` have been handled by close-issue (preserved or explicitly discarded).

**`close-branch` → `close-issue` (on success):**
- `INTEGRATION_SHA` — git SHA where the reviewed work now lives (e.g., new `main` HEAD after ff-merge). Empty if the project's integration doesn't yet produce a landed SHA (e.g., PR-pending workflows).
- `INTEGRATION_SUMMARY` — human-readable one-liner for the final user-facing message (`"merged to main @ abc1234 and pushed"`, `"PR opened: https://…"`, etc.).

Both return values are exported shell variables visible to close-issue after close-branch's agent steps complete. No JSON payload; no separate result file.

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
9. **Invoke `close-branch`** — Skill tool call with the three inputs. On non-zero exit, print the diagnostic and stop. No cleanup runs on failure.
10. **Stale-parent labeling (§3.5)** — skip entirely if `$INTEGRATION_SHA` is empty. Otherwise: verify label exists, walk Linear `blocks` children in `$RALPH_REVIEW_STATE`, use `is_branch_fresh_vs_sha "$INTEGRATION_SHA"` to detect stale, label+comment via `stale_label_and_comment` helper. Logic identical to today's Step 3.5; accumulated warnings printed immediately.
11. **Linear Done transition** — invoke `linear-workflow` with `$ISSUE_ID`, request `In Review → Done`.
12. **Codex broker reap + worktree removal** — identical to today's Step 7. Worktree removal runs last so CWD at `$MAIN_REPO` remains stable throughout.
13. **Final message** — print `$INTEGRATION_SUMMARY` if set, otherwise a generic "`$ISSUE_ID` closed" line.
14. **Red flags / stop conditions** — Linear preflight failures, close-branch failure, branch not resolvable, worktree-remove failure (never `--force`).

### `close-branch` structure (chezmoi's implementation)

Project-local skill at `.claude/skills/close-branch/SKILL.md` — replaces today's `close-feature-branch`.

Frontmatter:
- `name: close-branch`
- `description: ` — chezmoi-specific, notes it's invoked by `close-issue` (not a user entry point).
- `argument-hint: <issue-id>` (passed through from close-issue).
- `allowed-tools: Bash, Read, Glob, Grep` (no `Skill` — close-branch invokes no other skills).

Body sections in execution order:

1. **When to use** — called by `close-issue`, not invoked directly by the user.
2. **Inputs on entry** — `ISSUE_ID`, `FEATURE_BRANCH`, `WORKTREE_PATH`. CWD is the main checkout.
3. **Uncommitted-tracked-change gate** — `git -C "$WORKTREE_PATH" status --short`; any non-`??` line aborts (current §3).
4. **Rebase onto local main** — current Step 1 verbatim, including mechanical-conflict-resolution rules and abort criteria.
5. **Verify main-checkout clean + ff-merge** — current Step 2.
6. **Push** — current Step 3 verbatim, including push-rejection recovery sequence.
7. **Capture return values** — immediately after successful push:
   ```bash
   export INTEGRATION_SHA=$(git rev-parse HEAD)
   export INTEGRATION_SUMMARY="merged to main @ $(git rev-parse --short HEAD) and pushed"
   ```
8. **Detach HEAD in worktree** — current Step 4.
9. **Delete branch locally + remote** — current Step 5, `-d` not `-D`.
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

All helper sources switch from `$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/...` to `$HOME/.claude/skills/ralph-start/scripts/lib/...` in both close-issue and close-branch. This treats ralph-start as an installed peer skill, not as content in the host repo — matches how `ralph-spec` already sources its dependencies.

### Migration

One atomic changeset, in this order:

1. Create `agent-config/skills/close-issue/SKILL.md` with the full close-issue content.
2. Replace `.claude/skills/close-feature-branch/SKILL.md` with new `.claude/skills/close-branch/SKILL.md` (project-local). Rename the directory in a single git mv to preserve history.
3. Update `agent-config/CLAUDE.md` and user-global `~/.claude/CLAUDE.md` references from `/close-feature-branch` to `/close-issue`.
4. Update `agent-config/skills/ralph-start/SKILL.md`'s "When back" section: replace `/close-feature-branch ENG-NNN` with `/close-issue ENG-NNN`.
5. Update `agent-config/docs/playbooks/ralph-v2-usage.md` and any spec docs that reference the old skill name.
6. Allow `Skill(close-issue)` in the chezmoi `.claude/settings.local.json` (replacing `Skill(close-feature-branch)` if present).

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
- Trigger a close-branch failure case (e.g., dirty worktree) and verify close-issue stops without transitioning Linear or touching the worktree.
- Close an issue with an In-Review child branch to exercise Step 3.5 (requires a ralph-v2 DAG test case — reuse whatever was set up for ENG-208).

Automated tests for `branch_ancestry.sh` and `linear.sh` helpers (under `agent-config/skills/ralph-start/scripts/test/`) are unaffected; they exercise the helpers directly, not via either skill.
