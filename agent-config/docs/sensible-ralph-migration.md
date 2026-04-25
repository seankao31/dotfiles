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
- `skills/prepare-for-review/` → plugin `skills/prepare-for-review/`
- `skills/close-issue/` → plugin `skills/close-issue/`

The plugin versions of `prepare-for-review` and `close-issue` differ from
the chezmoi-global versions in a few ways: they source from
`$CLAUDE_PLUGIN_ROOT` instead of `$HOME/.claude/skills/`, use
`CLAUDE_PLUGIN_OPTION_*` workflow state names instead of the pre-extraction
`RALPH_*` exports, and inline their `linear issue update --state ...`
calls directly rather than delegating to an external `linear-workflow`
skill. The prose contracts are unchanged.

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

## Subsequent moves (2026-04-25)

Follow-up moves identified during the ENG-272 housekeeping pass — chezmoi
artifacts whose subject is plugin-internal behavior or feeds plugin work,
so they belong alongside the rest of the design trail in the plugin repo:

- `docs/decisions/2026-04-23-ralph-implement-step-3-scope-tightening.md`
  → plugin `docs/decisions/` (decision about ralph-implement Step 3 shape)
- `docs/progress/2026-04-18-ralph-v2-progress.md`
  → plugin `docs/progress/` (frozen archive of the v2 build journal)
- `docs/recon/2026-04-23-harness-component-reconnaissance.md`
  → plugin `docs/recon/` (Pass 1 results that ENG-259 Pass 2 builds on)
- `docs/specs/2026-04-24-remove-clean-branch-history-from-prepare-for-review.md`
  → plugin `docs/specs/` (forward-looking design for ENG-234)

These were copied as-is via `cp` — git history doesn't cross repos
without filter-repo, and four files isn't enough volume to justify it.
Live path references (the spec's edit target, the decision's playbook
cross-reference) were updated to plugin-relative paths during the move;
historical narrative in the progress and recon docs was left untouched
since rewriting paths there would falsify what was true at authorship.

## How to install the plugin

From any repo where you want to run ralph:

```
/plugin marketplace add seankao31/sensible-ralph
/plugin install sensible-ralph@sensible-ralph
```

At install time Claude Code prompts for the plugin's userConfig — accept
defaults for a stock Linear workflow or customize via `/config`.
