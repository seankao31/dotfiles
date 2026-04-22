# Make `clean-branch-history` trunk-portable and accept `--base` from caller

ENG-217 · Agent Config

## Problem

`agent-config/skills/clean-branch-history/SKILL.md` Step 1 hardcodes `main` as the trunk:

```bash
MERGE_BASE=$(git merge-base HEAD main)  # or target branch
git log --oneline $MERGE_BASE..HEAD
```

The `# or target branch` comment is a hint to the agent reading the skill, but the skill body doesn't parameterize the trunk name or accept a merge-base from the caller. For this repo (`main`-only) it works. For any other repo that uses `master`, `dev`, or anything else, the literal command returns the wrong merge-base or fails outright.

Paired with a second gap: the skill can't be pointed at a specific base SHA. When `/prepare-for-review` already computed `$BASE_SHA` (with stacked-branch protection — see `prepare-for-review/SKILL.md:92`), there's no way to pass it through. `clean-branch-history` re-derives its own merge-base from scratch against `main`, which is wrong for stacked branches.

Together these make the skill main-branch / non-stacked only. That's adequate for ralph v2 (the orchestrator always branches from `main`), but limits manual cross-repo usability and leaves `/prepare-for-review` unable to forward its stacked-branch-safe `$BASE_SHA`.

## Approach

Add an optional `--base <sha>` flag and a trunk-detection fallback to `clean-branch-history`. Mirror the resolution block already in `prepare-for-review/SKILL.md:75-89` verbatim so the two sites stay textually aligned.

### Interface

```
clean-branch-history [--base <sha>]
```

- Single optional flag. No positional arguments.
- Unknown flags → print a one-line usage and exit 1.

### Resolution order (in Step 1 of the skill)

1. If `--base <sha>` was passed, set `MERGE_BASE=<sha>` directly. Skip trunk detection.
2. Otherwise, auto-detect the trunk:
   ```bash
   TRUNK_REF=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null)
   if [ -n "$TRUNK_REF" ]; then
     MERGE_BASE=$(git merge-base HEAD "$TRUNK_REF")
   else
     TRUNK_REF=""
     git show-ref --verify --quiet refs/heads/main    && TRUNK_REF=refs/heads/main
     [ -z "$TRUNK_REF" ] && git show-ref --verify --quiet refs/heads/master          && TRUNK_REF=refs/heads/master
     [ -z "$TRUNK_REF" ] && git show-ref --verify --quiet refs/remotes/origin/main   && TRUNK_REF=refs/remotes/origin/main
     [ -z "$TRUNK_REF" ] && git show-ref --verify --quiet refs/remotes/origin/master && TRUNK_REF=refs/remotes/origin/master
     if [ -z "$TRUNK_REF" ]; then
       echo "Cannot determine trunk. Pass base SHA explicitly via --base <sha>." >&2
       exit 1
     fi
     MERGE_BASE=$(git merge-base HEAD "$TRUNK_REF")
   fi
   ```
3. Downstream steps use `$MERGE_BASE` unchanged.

The preference order (`origin/HEAD` first, then local `main`/`master`, then remote-tracking refs) matches `/prepare-for-review` so a future change to trunk-detection semantics updates both sites together.

### Why mirror `/prepare-for-review` verbatim (not extract a helper)

Two call sites aren't enough to justify a shared lib — SKILL.md files are markdown prose the agent reads, not importable scripts. An extracted helper would need to be a tracked executable (bash script under `agent-config/` or similar) that both skills shell out to, with its own tests and invocation contract. That's a larger change than this ticket warrants. Leaving the block duplicated keeps the diff tight; when a third call site shows up, that's the moment to factor out.

### Document structure changes in `clean-branch-history/SKILL.md`

- Step 1 heading stays "Identify commits".
- Step 1 opens with one short prose paragraph explaining the resolution: "If a caller passed `--base <sha>`, use it. Otherwise, auto-detect the trunk." Do not comment the code block itself — the prose carries the *why*.
- The new resolution code block replaces the current `MERGE_BASE=$(git merge-base HEAD main)  # or target branch` line.
- The existing `git log --oneline $MERGE_BASE..HEAD` line stays unchanged, immediately after the resolution block.
- No changes to Steps 2-6 or any other section of the skill. `$MERGE_BASE` remains the downstream variable, consumed by the safety-tag step, rebase invocation, and final log.

### Caller update: `/prepare-for-review` Step 4

In `agent-config/skills/prepare-for-review/SKILL.md` Step 4:

1. Replace the phrase `"computes its own merge-base (\`git merge-base HEAD main\`)"` with `"uses the \`--base "$BASE_SHA"\` computed earlier (protecting against stacked-branch breakage)"`.
2. Add `--base "$BASE_SHA"` to the prose describing the invocation. The skill's current guidance tells the agent to invoke `clean-branch-history` with no args; the new guidance tells the agent to pass `--base "$BASE_SHA"`.

No other changes to `/prepare-for-review`. `$BASE_SHA` is already computed above Step 1 with the stacked-branch warning block and is consumed by Step 1 (`update-stale-docs --base "$BASE_SHA"`) and Step 5 (`codex-review-gate --base "$BASE_SHA"`).

### Non-caller: `finishing-a-development-branch` override

`agent-config/superpowers-overrides/finishing-a-development-branch/SKILL.md` Step 1b invokes `clean-branch-history` with no args. **Leave this call unchanged.** With trunk auto-detection in place, no-arg invocation works on any main/master repo. The override is being actively retired in favor of `/prepare-for-review` + `/close-feature-branch`; investing in it now is wasted effort. If a user on a non-main/master repo runs this override directly, they'll see the clear "Cannot determine trunk" error and can either pass `--base` at that call site or, better, migrate to the ralph v2 flow.

## Scope

### In scope

- `agent-config/skills/clean-branch-history/SKILL.md` — argument parsing + trunk detection block in Step 1.
- `agent-config/skills/prepare-for-review/SKILL.md` — Step 4 prose update to pass `--base "$BASE_SHA"` and drop the "computes its own merge-base" language.

### Out of scope

- **No `--trunk <ref>` argument.** The `--base <sha>` path plus trunk auto-detection covers all surfaced use cases. YAGNI — add later if real demand appears.
- **No changes to the `finishing-a-development-branch` override.** It's being retired; trunk auto-detection makes the existing no-arg invocation work on main/master repos without modification.
- **No extraction of a shared trunk-detection helper.** Two call sites don't justify the overhead. Revisit when a third appears.
- **No changes to `/prepare-for-review`'s own `Compute base SHA` block.** We're mirroring it in `clean-branch-history`, not refactoring it.

## Acceptance criteria

1. `agent-config/skills/clean-branch-history/SKILL.md` Step 1 starts with argument parsing + trunk-detection resolution. Resolution code block matches `/prepare-for-review/SKILL.md:75-89` semantics verbatim (same precedence, same variable names, same error phrasing adjusted to "Pass base SHA explicitly via --base <sha>.").
2. Running `clean-branch-history` with no args on this repo (which has `main`) still works — trunk auto-detect resolves to `main` and the skill proceeds unchanged.
3. Running `clean-branch-history --base <sha>` skips trunk detection entirely and uses the passed SHA as `$MERGE_BASE`.
4. Running `clean-branch-history` in a repo that has no `origin/HEAD`, no local `main`/`master`, and no `origin/main`/`origin/master` exits 1 with the exact message `Cannot determine trunk. Pass base SHA explicitly via --base <sha>.` on stderr.
5. `/prepare-for-review` Step 4 prose reflects `--base "$BASE_SHA"` pass-through. The literal string `git merge-base HEAD main` no longer appears anywhere in that step's prose.
6. `agent-config/superpowers-overrides/finishing-a-development-branch/SKILL.md` Step 1b is unchanged.
7. `docs/playbooks/superpowers-patches.md` is unchanged (the override isn't being modified; no patch-description drift).

## Verification

No automated test harness exists for these skills — they're markdown the agent reads.

The implementer should manually exercise criteria 2 and 3 on a throwaway branch in this repo:

- Criterion 2: Create a branch with 2+ commits off `main`, run the skill with no args, confirm `$MERGE_BASE` resolves correctly and the rebase completes.
- Criterion 3: On the same branch, pass `--base <known-sha>` and confirm the skill uses that SHA (visible in the `git log --oneline $MERGE_BASE..HEAD` output).

Both outputs should be quoted in the handoff comment so the reviewer can see them. Criterion 4 can be verified by code inspection (the error path is straight-line shell).

Criteria 5, 6, 7 are diff-verifiable.

## Out-of-session implementation notes

This is the PRD for an autonomous implementer dispatched by `/ralph-start`. Follow `/prepare-for-review` at the end; don't merge — the human reviewer (Sean) handles the final merge via `/close-feature-branch`.

The fix is small and localized — expect one or two commits on the feature branch, not many.
