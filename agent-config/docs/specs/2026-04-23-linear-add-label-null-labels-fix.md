# linear_add_label null-labels + empty-array fix (ENG-239)

## Problem

`linear_add_label` in `agent-config/skills/ralph-start/scripts/lib/linear.sh` fails to apply a label when the target issue has no existing labels. Two defects compose:

1. **jq null-iteration.** `jq -r '.labels.nodes[].name'` errors with `Cannot iterate over null (null)` when Linear returns `labels.nodes: null` (which it does for an issue that has never had a label, rather than `[]`).
2. **Bash 3.2 empty-array expansion under `set -u`.** `for lbl in "${existing_labels[@]}"; do` raises `existing_labels[@]: unbound variable` on macOS system bash when the array is empty. Documented in memory `reference_bash32_empty_array.md`.

### How it surfaced

Hit during the `/close-feature-branch ENG-228` ritual on 2026-04-23. Step 3.5's stale-parent labeling correctly identified ENG-230 as stale and posted the explanatory comment, but the subsequent `linear_add_label "$RALPH_STALE_PARENT_LABEL"` call failed with both errors. ENG-230 had no existing labels.

The label was applied manually via `linear issue update ENG-230 --label "stale-parent"` to recover. An in-flight hotfix (`5a0982e`) was committed and then reverted (`aceb02e`) so the fix could go through TDD with proper provenance — consistent with the "No in-flight bugfixes during workflow rituals" discipline.

### Why the existing test missed this

`agent-config/skills/ralph-start/scripts/test/linear.bats:519` already contains a test named *"linear_add_label works when issue has no existing labels"* that stubs `labels.nodes: []`. It has been passing all along despite the production bug, because:

- `[]` is a valid jq iterable — the null-iteration error never triggers for this stub.
- The shared test helper `call_fn` (lines 51-54) spawns its subshell via `bash -c "source '$LINEAR_SH' && $fn $*"`. That fresh shell inherits no `set` flags from the parent, so `set -u` is not active inside the function body — the empty-array expansion is harmless in the test environment.

Production runs the function under `set -euo pipefail`: `orchestrator.sh:2` and `preflight_scan.sh:2` both enable strict mode at the top of their executable scripts, and `lib/config.sh` explicitly documents at line 16 that "All callers in this codebase run with `set -euo pipefail` already active." Shell `set` flags propagate through sourced libraries and called functions within the same shell process, so any strict-mode script that calls `linear_add_label` exercises the empty-array path under `set -u`.

This test/production drift is the root cause that let the bug reach `/close-feature-branch`.

## Fix

### 1. Two-line change in `linear_add_label`

File: `agent-config/skills/ralph-start/scripts/lib/linear.sh`

```diff
-  done < <(printf '%s' "$view_json" | jq -r '.labels.nodes[].name')
+  done < <(printf '%s' "$view_json" | jq -r '(.labels.nodes // []) | .[].name')

-  for lbl in "${existing_labels[@]}"; do
+  for lbl in ${existing_labels[@]+"${existing_labels[@]}"}; do
```

- **jq guard** — `(.labels.nodes // []) | .[].name` coerces `null` to `[]` before iteration.
- **Bash guard** — `${arr[@]+"${arr[@]}"}` expands to the array elements when set, to nothing when empty. Portable to bash 3.2 under `set -u`.

The diff matches the reverted commit `5a0982e` verbatim. No other logic changes.

### 2. Strict-mode `call_fn` in `linear.bats`

File: `agent-config/skills/ralph-start/scripts/test/linear.bats`

```diff
 call_fn() {
   local fn_name="$1"; shift
-  bash -c "source '$LINEAR_SH' && $fn_name $*"
+  bash -c "set -euo pipefail; source '$LINEAR_SH' && $fn_name $*"
 }
```

Closes the test/production drift for every function in `linear.sh`, not just `linear_add_label`. Required for the new null-labels test to faithfully reproduce the production failure mode, and also makes the pre-existing "empty labels" test at line 519 finally exercise the bash 3.2 empty-array bug it was meant to guard against.

### 3. New bats test — null-labels case

File: `agent-config/skills/ralph-start/scripts/test/linear.bats`, insert after the existing "does not duplicate" test (~line 555):

```bash
@test "linear_add_label handles issue whose labels.nodes is null" {
  cat > "$STUB_DIR/linear" <<'STUB'
#!/usr/bin/env bash
printf '%q ' "$@" >> "$STUB_ARGS_FILE"
printf '\n' >> "$STUB_ARGS_FILE"
if [[ "$*" == *"view"* ]]; then
  printf '{"identifier": "ENG-54", "branchName": "eng-54-x", "state": {"name": "Approved"}, "labels": {"nodes": null}}'
fi
STUB
  chmod +x "$STUB_DIR/linear"

  run call_fn linear_add_label ENG-54 only-label

  [ "$status" -eq 0 ]
  update_call="$(grep "issue update ENG-54" "$STUB_ARGS_FILE")"
  [[ "$update_call" == *"only-label"* ]]
}
```

Reproduces the 2026-04-23 ENG-230 production failure mode.

### 4. No edit to the existing "empty labels" test at line 519

Once `call_fn` runs under strict mode, the existing test will fail on HEAD (bash empty-array under `set -u`) and pass after the fix. It finally does what it was written to do. The commit message should acknowledge that this test now provides real coverage of the bash 3.2 path.

## Implementation order (TDD)

Do not try to see the new null-labels test fail before flipping `call_fn` — under the non-strict harness the test *accidentally passes* even on buggy code, because neither defect has teeth without `set -u`. That accidental pass is itself the evidence that the harness needs the flip. Concretely:

- jq errors with `Cannot iterate over null (null)` and exits non-zero, but its exit status isn't captured; the `while IFS= read -r` process substitution just closes with empty stdin, so `existing_labels=()`.
- Without `set -u`, `for lbl in "${existing_labels[@]}"` over an empty array is harmless.
- The function proceeds to `linear issue update ENG-54 --label only-label`, which the stub accepts with exit 0.
- The test's `status -eq 0` and update-call assertions both pass.

So the sequence is:

1. Flip `call_fn` to `bash -c "set -euo pipefail; source '$LINEAR_SH' && $fn_name $*"`. Run `linear.bats` — the existing "empty labels" test at line 519 now fails (bash empty-array trips under `set -u`). This is the first half of the red state, using a test that already existed.
2. Add the new null-labels test with the stub that returns `labels.nodes: null`. Run `linear.bats` — this test also fails, same bash empty-array bug (once jq's null path is hit, `existing_labels` is empty, and strict mode trips). This is the second half of the red state.
3. Apply the two-line fix to `linear_add_label`. Run `linear.bats` — all tests in this file pass. The jq guard handles the null case; the `${arr[@]+…}` guard handles the empty-array expansion under `set -u`.
4. Run the full bats suite: `bats agent-config/skills/ralph-start/scripts/test/*.bats`. Any cross-file failures introduced by the strict-mode flip are out of scope per Approach A's blast-radius rule — stop and report back before expanding scope.
5. Commit the code fix, test harness change, and new test as a single logical unit. Commit message should note the `5a0982e`/`aceb02e` history briefly for provenance.

## Scope boundaries

- **In scope:** the two-line fix in `linear_add_label`, flipping `call_fn` in `linear.bats` only, the new null-labels test.
- **Out of scope:** adopting strict-mode helpers in other bats files (`orchestrator.bats`, `preflight_scan.bats`, etc.). If the full bats run surfaces failures outside `linear.bats` caused by the `call_fn` flip, stop and report — do not broaden the fix.
- **Out of scope:** docstring updates to `linear_add_label` (its contract was always "preserve existing labels and add new"; null-safety is a correctness property implied by that contract, self-evident from the fixed code).
- **Out of scope:** retroactive cleanup of the manually-applied `stale-parent` label on ENG-230 — it's correct and should stay.

## Prerequisites / blockers

None. Pure bugfix on a shipped helper, no ordering dependency on other Approved or in-flight work.

## Acceptance criteria

1. A new bats test in `scripts/test/linear.bats` reproducing the null-labels case — fails on HEAD (before the fix), passes after.
2. All existing bats tests in `scripts/test/linear.bats` pass under the strict-mode `call_fn`, with no edits to their assertions.
3. Full `scripts/test/*.bats` suite passes, or the implementer stops and reports cross-file failures per the blast-radius rule.
4. Close-feature-branch Step 3.5 can apply `stale-parent` to a labelless issue without manual recovery (validated implicitly by fixing the helper; no ritual re-run required).

## References

- Reverted commit: `5a0982e` (technical fix, correct; reverted by `aceb02e` to re-do with TDD).
- Memory: `reference_bash32_empty_array.md`.
- Surfaced during: ENG-228 close-feature-branch ritual, 2026-04-23.
- Underlying feature: ENG-208 (Step 3.5 stale-parent labeling).
