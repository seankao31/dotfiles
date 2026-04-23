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

Issues for this repo go into one of two projects:

- **Agent Config** (initiative: AI Collaboration Toolkit) — changes to
  anything under `agent-config/`: custom skills, superpowers overrides,
  hooks, `CLAUDE.md`, design notes, playbooks.
- **Machine Config** (initiative: Machine Config) — changes to chezmoi
  plumbing, dotfiles outside `agent-config/`, or machine-level tooling
  preferences that aren't specific to Claude Code.

For out-of-scope bug discoveries during any session in this repo, file a Linear issue in the appropriate project above.
