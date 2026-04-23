# Make `lib/config.sh` portable between bash 3.2+ and zsh

## Problem

`agent-config/skills/ralph-start/scripts/lib/config.sh` contains two bash-only constructs that fail when the script is sourced from zsh:

1. **`_config_load` (line 159)** — `_config_lib_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"`. zsh has no `BASH_SOURCE`; the variable expands to empty, `dirname ""` returns `.`, and the subsequent `source "$_config_lib_dir/linear.sh"` resolves relative to CWD. Source fails unless CWD happens to have a `linear.sh` file — in which case it silently sources the wrong file.
2. **`_config_load_workflow` (line 76)** — `for i in "${!staged_names[@]}"; do`. zsh parses `${!arr[@]}` as the indirect-name-expansion form and emits `bad substitution`.

Claude Code's Bash tool dispatches commands through the user's login shell (`/bin/zsh -c` on macOS). Skill-doc finalization snippets that source `config.sh` directly — `/ralph-spec` and `/close-feature-branch` both do this — trip both bugs when pasted into the Bash tool. Verified reproduction:

```
zsh -c 'source ~/.claude/skills/ralph-start/scripts/lib/linear.sh; source ~/.claude/skills/ralph-start/scripts/lib/config.sh ~/.claude/skills/ralph-start/config.json; echo "$RALPH_APPROVED_STATE"'
# _config_load:source:10: no such file or directory: <CWD>/linear.sh
# _config_load_workflow:49: bad substitution
# (empty RALPH_APPROVED_STATE)
```

## Decision

Make `config.sh` source-portable between bash 3.2+ and zsh. Two surgical edits, neither of which requires dual-shell parameter-flag tricks:

1. **Delete the internal re-source of `linear.sh`.** Every current caller already sources `linear.sh` explicitly before `config.sh` (verified across `orchestrator.sh:46`, `preflight_scan.sh:37`, `build_queue.sh:41`, `dag_base.sh:30`, `/ralph-spec` SKILL.md finalization, `/close-feature-branch` Pre-flight §1). The internal re-source is dead weight. Deleting it eliminates the `${BASH_SOURCE[0]}` use entirely — no portability idiom to maintain.
2. **Replace parallel indexed arrays with value-iterated `NAME=VALUE` tuples.** `_config_load_workflow`'s two-pass atomic-export logic is preserved, but the iteration moves from `for i in "${!arr[@]}"` (bash-only) to `for pair in "${arr[@]}"` (identical behavior in bash and zsh). This sidesteps zsh's 1-indexed-by-default array semantics entirely — no indexing primitive is touched.

The fail-loud guard on the deleted re-source (`declare -f linear_list_initiative_projects` check) ensures callers that forget to pre-source `linear.sh` get a clear error at load time instead of a late "command not found" during `.ralph.json` initiative expansion.

### Alternatives considered

- **Keep the internal re-source, use a shell-detected portable path idiom.** Something like `if [ -n "$BASH_VERSION" ]; then _dir=$(dirname "${BASH_SOURCE[0]}"); elif [ -n "$ZSH_VERSION" ]; then _dir=${${(%):-%x}:A:h}; fi`. Rejected: introduces zsh-specific parameter-flag syntax (`${(%):-%x}`, `:A:h`) that won't parse in bash without strict guards — more surface area, more fragility, for redundancy that zero callers exercise.
- **Document-only fix (ticket's option B): wrap skill snippets in `bash <file>`.** Rejected: every future skill-doc consumer of `config.sh` would need the wrapper pattern, and the `/ralph-spec` "Shell note" already complex.
- **C-style `for ((i=0; i<${#arr[@]}; i++))` for the workflow loop.** Rejected: bash arrays are 0-indexed, zsh arrays are 1-indexed by default — the same loop gives different element mappings across shells. This is the "awkward" semantics called out in the 2026-04-18 ralph-v2 progress log.

### Prior design decision (context)

The 2026-04-18 ralph-v2 progress log captured a preference to keep `config.sh` bash-only and absorb sourcing into bash-shebanged entry-point scripts. At the time, all `config.sh` consumers were bash-shebanged (`orchestrator.sh`, `preflight_scan.sh`, `dag_base.sh`, `build_queue.sh`). That invariant was broken on 2026-04-22 when `/ralph-spec` (per `docs/decisions/2026-04-22-ralph-spec-sources-ralph-start-libs.md`) and subsequently `/close-feature-branch` added raw-paste skill-doc consumers. This ticket revisits that decision: the value-iteration pattern chosen here avoids the 1-indexing awkwardness that originally motivated the bash-only choice, so the trade-off that supported the prior decision no longer holds.

## File changes

### 1. `agent-config/skills/ralph-start/scripts/lib/config.sh`

**a. Header comment (lines 1-26)** — replace the "Must be sourced from bash (bash 3.2+): uses `${!arr[@]}`…" paragraph with a portability note:

> Portable between bash 3.2+ and zsh. Callers must source `lib/linear.sh` before this file (it defines `linear_list_initiative_projects`, which the `.ralph.json` `initiative` expansion path calls).

**b. `_config_load_workflow` (lines 27-80)** — replace the parallel-array staging with a single `NAME=VALUE` tuple array iterated by value. Two-pass atomic-export semantic preserved:

```bash
# Two-pass approach: collect all values first, then export all-or-nothing.
# Staging as NAME=VALUE tuples (rather than parallel indexed arrays) lets us
# iterate by value — portable between bash and zsh, which disagree on array
# indexing. Workflow values are single-line jq scalars with no '=' inside,
# so splitting on the first '=' is unambiguous.
local -a staged=()

local entry var_name json_key value
for entry in "${keys[@]}"; do
  var_name="${entry%%:*}"
  json_key="${entry##*:}"

  # jq returns literal "null" when the key is absent; exits non-zero on parse error
  value="$(jq -r --arg k "$json_key" 'if has($k) then .[$k] else "null" end' "$config_file")" || {
    echo "config: failed to parse config file '$config_file'" >&2
    return 1
  }

  if [[ "$value" == "null" ]]; then
    echo "config: missing required key '$json_key'" >&2
    return 1
  fi

  staged+=("$var_name=$value")
done

# All keys present — export atomically.
# Empty string is allowed; callers validate domain constraints.
local pair name val
for pair in "${staged[@]}"; do
  name="${pair%%=*}"
  val="${pair#*=}"
  printf -v "$name" '%s' "$val"
  export "$name"
done
```

**c. `_config_load` (lines 151-181)** — delete the `_config_lib_dir` block (lines 154-161). Replace with a fail-loud guard at function entry:

```bash
_config_load() {
  local config_file="$1"

  # lib/linear.sh must be sourced by the caller before this file — it
  # defines linear_list_initiative_projects, which _config_load_scope
  # calls for the .ralph.json `initiative` shape. Fail loudly if missing
  # so callers get a clear message rather than a late "command not found".
  if ! declare -f linear_list_initiative_projects >/dev/null; then
    echo "config: source lib/linear.sh before lib/config.sh (defines linear_list_initiative_projects)" >&2
    return 1
  fi

  _config_load_workflow "$config_file" || return 1

  # (rest of function unchanged: _config_resolve_repo_root, _config_load_scope,
  # RALPH_CONFIG_LOADED tuple)
```

### 2. `.claude/skills/close-feature-branch/SKILL.md`

Pre-flight §1 (around line 88) currently claims `config.sh` "transitively sources `lib/linear.sh`". That claim breaks with change 1c. Update the prose and the code block:

**Prose** — replace "and transitively sources `lib/linear.sh`" with: "`lib/linear.sh` must be sourced first — it defines helpers (`linear_get_issue_blockers` used in §2, `linear_get_issue_blocks` used in §3.5)."

**Code block** — add an explicit `source linear.sh` line before the existing `source config.sh`:

```bash
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/linear.sh"
source "$MAIN_REPO/agent-config/skills/ralph-start/scripts/lib/config.sh" \
  "${RALPH_CONFIG:-$MAIN_REPO/agent-config/skills/ralph-start/config.json}"
```

### 3. `agent-config/skills/ralph-spec/SKILL.md`

The "Shell note" preamble at line 147 currently mentions `config.sh` "uses bash 3.2+ features (array indirection)" and prescribes `bash -c` / temp-script wrapping for zsh users. Strip the bash-only clause and zsh-wrapping instructions. Keep the state-sharing constraint (a distinct concern — multi-block snippets share `RALPH_PROJECTS`, `$STATE`, `$PRIOR`, `$ISSUE_ID`, `linear_get_issue_blockers` across blocks and need a single shell session regardless of shell type).

The existing finalization snippet at step 1 already sources `linear.sh` before `config.sh` — no code changes needed there.

### 4. `agent-config/docs/decisions/2026-04-22-ralph-spec-sources-ralph-start-libs.md`

The "Bash requirement" paragraph in the Reasoning section claims `config.sh` uses `${!arr[@]}` and fails in zsh. That becomes historically inaccurate after this ticket lands. Rewrite to:

> **Portability.** `config.sh` is portable between bash and zsh (ENG-249). Earlier versions required bash due to array-indirection syntax; the current implementation stages values as `NAME=VALUE` tuples and iterates by value to sidestep the cross-shell indexing difference.

## Testing

Add two bats tests to `agent-config/skills/ralph-start/scripts/test/config.bats`. Both should be red before the fix and green after (strict TDD).

### Test 1 — zsh sourcing succeeds

```bats
@test "config.sh sources cleanly from zsh" {
  command -v zsh >/dev/null || skip "zsh not installed"

  run zsh -c "
    cd '$TEST_REPO_ROOT'
    source '$(dirname "$CONFIG_SH")/linear.sh' || exit 10
    source '$CONFIG_SH' '$EXAMPLE_CONFIG' || exit 11
    printf 'APPROVED=%s\n' \"\$RALPH_APPROVED_STATE\"
  " 2>&1

  [ "$status" -eq 0 ]
  if [[ "$output" != *"APPROVED=Approved"* ]]; then
    echo "expected APPROVED=Approved, got: $output" >&2
    return 1
  fi
}
```

Currently red (reproduces the ticket's failure mode). After the fix, prints `APPROVED=Approved` with exit status 0.

### Test 2 — fail-loud guard fires when `linear.sh` not pre-sourced

```bats
@test "config.sh fails loudly if linear.sh not pre-sourced" {
  run bash -c "cd '$TEST_REPO_ROOT' && source '$CONFIG_SH' '$EXAMPLE_CONFIG'" 2>&1
  [ "$status" -eq 1 ]
  if [[ "$output" != *"linear.sh"* ]]; then
    echo "expected 'linear.sh' in error, got: $output" >&2
    return 1
  fi
}
```

Currently passes trivially for the wrong reason — the internal re-source finds `linear.sh`. After change 1c, passes because the new guard fires.

### Existing tests

All 12 existing `config.bats` tests must continue to pass. They use `bash -c` subshells and source `config.sh` without pre-sourcing `linear.sh` — **they will fail** after change 1c unless updated to source `linear.sh` first. Update `source_config` helper and all bare-`bash -c` blocks in those tests to source `linear.sh` before `config.sh`.

Grep anchor: every test that runs `source '$CONFIG_SH'` needs a preceding `source '$(dirname "$CONFIG_SH")/linear.sh'`.

### Manual verification

From the ticket's acceptance section:

```
zsh -c 'source ~/.claude/skills/ralph-start/scripts/lib/linear.sh; source ~/.claude/skills/ralph-start/scripts/lib/config.sh ~/.claude/skills/ralph-start/config.json; echo "$RALPH_APPROVED_STATE"'
```

Expected: prints `Approved` with no errors.

### Integration checks

After code changes, run the full `config.bats` suite plus the bats files that source `config.sh` indirectly: `build_queue.bats`, `orchestrator.bats`, `preflight_scan.bats`, `dag_base.bats`. None of those should regress.

## Out of scope

- **Audit of other bashisms in `agent-config/`.** Per the ticket's out-of-scope clause. Specifically, `preflight_labels.sh` uses `${!var}` (scalar indirect), also a zsh-breaker, but it's sourced only from bash-shebanged `orchestrator.sh` / `preflight_scan.sh` and is never reached under zsh. A dedicated audit ticket can cover broader portability.
- **Sibling libs** (`linear.sh`, `worktree.sh`, `branch_ancestry.sh`) — already clean of `${BASH_SOURCE}` and `${!arr[@]}`; no portability work needed here.
- **Changes to `set -euo pipefail` handling.** The file's existing top-of-file comment forbids `set` commands at top level; that invariant is preserved.

## Prerequisites / `blocked-by`

None. Self-contained fix.

## Acceptance

- Test 1 passes (`config.sh sources cleanly from zsh`).
- Test 2 passes (`config.sh fails loudly if linear.sh not pre-sourced`).
- All existing `config.bats` tests pass after updates to pre-source `linear.sh`.
- `build_queue.bats`, `orchestrator.bats`, `preflight_scan.bats`, `dag_base.bats` — no regressions.
- Manual verification command prints `Approved` with exit status 0 under zsh.
- `close-feature-branch` Pre-flight §1 no longer relies on transitive sourcing.
- `ralph-spec` SKILL.md "Shell note" no longer mentions bash-only constraints on `config.sh`.
