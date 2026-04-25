## Superpowers Overrides

Custom overrides of upstream superpowers plugin skills live in
`agent-config/superpowers-overrides/<skill-name>/SKILL.md`. Each is a
complete copy of the upstream file with our changes applied.

When modifying an override:
1. Edit the override file in `agent-config/superpowers-overrides/`
2. Update the patch description in `agent-config/docs/playbooks/superpowers-patches.md`
3. If adding a new override, also symlink it into the plugin cache and add it to the symlink script in the patches doc

The patches doc describes **what makes each override different from upstream** so changes can be re-applied when the plugin updates.

## Linear

Team: **Engineering (ENG)**

Issues for this repo go into one of these projects:

- **Agent Config** (initiative: AI Collaboration Toolkit) —
  chezmoi-side agent infrastructure: custom skills,
  superpowers overrides, hooks, `CLAUDE.md`, design notes,
  playbooks. NOT the ralph workflow itself (that's Sensible
  Ralph).
- **Sensible Ralph** (initiative: AI Collaboration Toolkit) —
  the `sensible-ralph` plugin: ralph-* skills,
  `prepare-for-review`, `close-issue`, plugin-internal
  config. Implemented in the plugin repo at
  github.com/seankao31/sensible-ralph, not here.
- **Machine Config** (initiative: Machine Config) — chezmoi
  plumbing, dotfiles outside `agent-config/`, machine-level
  tooling.

For out-of-scope bug discoveries during any session in this repo, file a Linear issue in the appropriate project above.
