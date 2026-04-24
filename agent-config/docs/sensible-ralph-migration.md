# Sensible-ralph migration

As of 2026-04-24, the ralph workflow lives in the `sensible-ralph` plugin at
[github.com/seankao31/sensible-ralph](https://github.com/seankao31/sensible-ralph).
Prior design history pre-extraction remains at the specs and decisions that
stay in this repo (see `agent-config/docs/specs/` and
`agent-config/docs/decisions/` for items not in the move list — the plugin
repo's `docs/specs/` and `docs/decisions/` hold the rest of the design
trail).

Post-extraction work happens in the plugin repo.

## What moved

Skills:

- `skills/ralph-start/` → plugin `skills/ralph-start/`
- `skills/ralph-spec/` → plugin `skills/ralph-spec/`
- `skills/ralph-implement/` → plugin `skills/ralph-implement/`

Playbook:

- `docs/playbooks/ralph-v2-usage.md` → plugin `docs/usage.md`

Design docs (3 specs, 5 decisions — filter-repo preserved history):

- `docs/specs/2026-04-17-ralph-loop-v2-design.md`
- `docs/specs/2026-04-21-ralph-scope-model-design.md`
- `docs/specs/2026-04-21-ralph-implement-skill-design.md`
- `docs/decisions/2026-04-20-ralph-v2-ambiguous-outcome-handling.md`
- `docs/decisions/2026-04-20-ralph-v2-multi-parent-integration-abort.md`
- `docs/decisions/2026-04-22-ralph-scope-discovery-show-toplevel.md`
- `docs/decisions/2026-04-22-ralph-spec-sources-ralph-start-libs.md`
- `docs/decisions/2026-04-22-ralph-spec-finalization-invariants.md`

## What stayed

These remain in this repo as historical context — their content is about
chezmoi's adoption of ralph, not about the ralph workflow itself:

- `docs/specs/2026-04-22-ralph-workflow-modes-rule-audit-design.md`
- `docs/specs/2026-04-22-ralph-v2-workflow-evaluation-design.md`
- `docs/specs/2026-04-23-simplify-autonomous-mode-overrides-design.md`
- `docs/decisions/2026-04-22-ralph-spec-visual-companion-glob.md`
- `docs/progress/2026-04-18-ralph-v2-progress.md`

Decisions post-2026-04-22 that further hardened the ralph skills (e.g.
`2026-04-23-ralph-implement-step-3-scope-tightening.md`) also stay — they
document chezmoi-era fixes that the plugin has already absorbed via
filter-repo + subsequent commits in the plugin repo.

## How to install the plugin

From any repo where you want to run ralph:

```
/plugin marketplace add seankao31/sensible-ralph
/plugin install sensible-ralph@sensible-ralph
```

At install time Claude Code prompts for the plugin's userConfig — accept
defaults for a stock Linear workflow or customize via `/config`.
