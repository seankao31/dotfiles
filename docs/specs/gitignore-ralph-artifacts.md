# Gitignore ralph orchestrator artifacts to eliminate spurious pre-flight prompts

ENG-237 · Agent Config

## Problem

The ralph orchestrator writes four untracked files during a run:

| File | Location | Written by | Lifetime |
| -- | -- | -- | -- |
| `.ralph-base-sha` | each worktree | orchestrator (pre-dispatch) | read by `prepare-for-review` during the session |
| `ralph-output.log` | some worktrees (tee target) | orchestrator (continuous) | open FD held for duration of session |
| `ordered_queue.txt` | main checkout | orchestrator (build queue step) | input to the orchestrator run |
| `progress.json` | main checkout | orchestrator (per-issue outcome) | post-run triage artifact |

None of these are in `.gitignore`. This causes two downstream problems:

### 1. `/close-feature-branch` Pre-flight §4 stops on every ralph close

`git ls-files --others --exclude-standard` lists `.ralph-base-sha` (and `ralph-output.log` when present). Pre-flight §4 then requires the operator to choose commit / copy-out / discard for each file, per `.claude/skills/close-feature-branch/SKILL.md:152` ("Never silently discard untracked files — `plan.md` files have been lost this way"). Observed during ENG-208 close; the agent resolved it by `rm .ralph-base-sha`, which technically violates the skill's preservation rule on ephemerality grounds.

### 2. `/prepare-for-review` pre-flight whitelist is incomplete

`agent-config/skills/prepare-for-review/SKILL.md:117` hard-codes `grep -v '^\.ralph-base-sha$'` as the only exception. `ralph-output.log` isn't whitelisted, so the pre-flight flags it; and the whitelist itself is a maintenance burden — every future orchestrator artifact would need another `grep -v`.

Gitignoring the four files at the repo root fixes both skills at once, since both pre-flights rely on `--exclude-standard`. It also lets the `prepare-for-review` whitelist be removed outright.

## Approach

Three atomic edits, one commit.

### 1. `.gitignore` — add a labeled block

Append to `.gitignore` at the repo root:

```gitignore
# Ralph orchestrator artifacts (ENG-237)
.ralph-base-sha
ralph-output.log
ordered_queue.txt
progress.json
```

The leading comment is load-bearing: filenames like `progress.json` and `ordered_queue.txt` are generic out of context, and the comment tells future readers why they're ignored and where to look if they need to be unignored.

### 2. `agent-config/skills/prepare-for-review/SKILL.md` — remove the obsolete whitelist

**Line 117** — remove the dead `grep -v`:

```bash
# before
NEW_FILES=$(git ls-files --others --exclude-standard | grep -v '^\.ralph-base-sha$')
# after
NEW_FILES=$(git ls-files --others --exclude-standard)
```

**Lines 55, 60, 62 (the pre-flight bullet list and the surrounding paragraphs)** — drop the `.ralph-base-sha`-is-acceptable-untracked language. Concretely:

- Line 55's bullet ("`?? .ralph-base-sha` — acceptable and expected in ralph-loop sessions. The orchestrator writes this file before dispatch. Do not commit or remove it.") should be deleted entirely. With `.gitignore` in place, `.ralph-base-sha` will no longer appear as `??` in `git status`.
- Line 60's parenthetical ("other than `.ralph-base-sha`") should be deleted. The sentence becomes a flat rule: any `??` = stop and handle.
- Line 62's parenthetical ("with only the `.ralph-base-sha` exception") should be deleted for the same reason.

The rewrite should leave the pre-flight's shape intact — the point is a clean "any `??` line means something is wrong, stop and investigate" rule with no exceptions, since gitignore now handles the orchestrator artifact case transparently.

**Lines 68, 70, 86 (reading `.ralph-base-sha` to scope the codex review) are UNCHANGED.** The file still physically exists and is still consumed by the skill; only its pre-flight visibility goes away.

### 3. Retire the ad-hoc workaround memory

The memory entry `~/.claude/projects/-Users-seankao--local-share-chezmoi/memory/project_ralph_output_log_preflight_gap.md` documents the "exclude at Step 3.5" workaround that this fix obsoletes.

- Delete the file.
- Remove its entry from `~/.claude/projects/-Users-seankao--local-share-chezmoi/memory/MEMORY.md`.

## Acceptance criteria

- `.gitignore` contains the labeled block with the four filenames.
- `git check-ignore -v .ralph-base-sha ralph-output.log ordered_queue.txt progress.json` (run from the repo root) resolves each filename against the new `.gitignore` block.
- `git status --porcelain` in the repo root shows none of the four filenames, even when `ordered_queue.txt` and `progress.json` physically exist.
- `prepare-for-review/SKILL.md` no longer contains the string `grep -v '^\.ralph-base-sha$'`.
- `prepare-for-review/SKILL.md` pre-flight prose no longer calls out `.ralph-base-sha` as an expected/allowed untracked line.
- `project_ralph_output_log_preflight_gap.md` is deleted and no longer listed in `MEMORY.md`.

## Verification

- Run the `git check-ignore` and `git status --porcelain` checks above.
- Render `prepare-for-review/SKILL.md` and re-read the pre-flight section to confirm it reads as a clean "any `??` = stop" rule with no stale exception language.
- `grep -rn 'ralph_output_log_preflight_gap' ~/.claude/projects/-Users-seankao--local-share-chezmoi/memory/` returns no matches.

Do **not** attempt to smoke-test `/close-feature-branch` or `/prepare-for-review` end-to-end from this session — those skills assume an in-flight ralph session. Smoke testing happens naturally during the next real ralph close.

## Out of scope

- Any edits to `close-feature-branch/SKILL.md`. Its pre-flight §4 is already generic (`git ls-files --others --exclude-standard`) and automatically benefits from the new gitignore entries — no whitelist there to remove.
- Any refactor of `prepare-for-review/SKILL.md` beyond removing the dead whitelist and stale prose. No step reordering, no generalization of the whitelist mechanism, no changes to Step 3.5's staging logic.
- Any changes to the ralph orchestrator scripts (`scripts/build_queue.sh`, `scripts/orchestrator.sh`) or the `stdout_log_filename` config option.
- Global gitignore, chezmoi-deployed `dot_gitignore`, per-directory `.gitignore` files, or any gitignore location other than the repo's root `.gitignore`.
- Force-add mechanics or tooling. `git add -f <path>` remains available for edge cases where one of these artifacts needs to be committed explicitly; no code needed.

## Notes

- Git worktrees inherit the parent repo's root `.gitignore`, so gitignoring `.ralph-base-sha` at the root covers every worktree (including already-existing ones) without per-worktree configuration.
- None of these filenames are currently tracked in the repo (`git ls-files` shows no matches), so adding them to `.gitignore` will not orphan any tracked file.
- The orchestrator's `bats` tests reference these filenames but operate in isolated temp directories with their own gitignores; the repo-root change cannot affect them.
