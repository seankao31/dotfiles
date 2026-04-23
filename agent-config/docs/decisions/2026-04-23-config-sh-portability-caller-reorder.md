# Entry-point scripts reordered to source `linear.sh` before `config.sh`

## Context

ENG-249 made `config.sh` portable between bash 3.2+ and zsh by:
1. Replacing `${!arr[@]}` with value-iterated `NAME=VALUE` tuples.
2. Deleting the internal `source linear.sh` (which used `${BASH_SOURCE[0]}`, empty in zsh) and adding a fail-loud guard at `_config_load` entry that requires `linear_list_initiative_projects` to be defined.

The fail-loud guard fires unconditionally at load time — even when the caller's `.ralph.json` uses the `projects` shape (which never calls `linear_list_initiative_projects`). This is deliberate: fail at load time with a clear message, not at initiative-expansion time with a cryptic "command not found".

## Decision

The four entry-point bash scripts (`orchestrator.sh`, `preflight_scan.sh`, `build_queue.sh`, `dag_base.sh`) were reordered to source `lib/linear.sh` before the conditional `lib/config.sh` source.

## Reasoning

The ENG-249 spec claimed these callers "already source `linear.sh` explicitly before `config.sh`" (citing line numbers such as `orchestrator.sh:46`, `preflight_scan.sh:37`). That claim was factually wrong at spec time: the actual code sourced `config.sh` first, then `linear.sh` unconditionally after. With the new unconditional load-time guard in `_config_load`, the previous order would cause every entry-point to fail with the "source lib/linear.sh before lib/config.sh" message on every invocation.

The reorder is a one-line change per script and is safe because `linear.sh` has no source-time dependency on `config.sh` exports — those are used at function-call time, not at the moment the file is sourced.

## Consequences

Future scripts that consume `config.sh` must source `linear.sh` first. `config.sh`'s header comment states this requirement; the fail-loud guard enforces it at load time. If that guard is ever removed or weakened (e.g., moved to lazy evaluation inside `_config_load_scope`), the PRD's original motivation should be re-read: the guard's value is the early, clear error message, not just correctness.
