# Dotfiles

Personal dotfiles managed with [chezmoi](https://www.chezmoi.io/).

## Setup

Install [chezmoi](https://www.chezmoi.io/install/), then:

```bash
chezmoi init <this-repo-url>
chezmoi apply
```

---

## Claude Code

[Claude Code](https://docs.claude.com/en/docs/claude-code) configuration —
`CLAUDE.md`, hook scripts, custom skills, superpowers plugin overrides, and
design notes — is split between two top-level directories:

```
.
├── dot_claude/                   # chezmoi source for ~/.claude/
│   ├── settings.json.tmpl        # templated copy-mode file
│   ├── symlink_CLAUDE.md.tmpl    # → agent-config/CLAUDE.md
│   ├── symlink_hooks.tmpl        # → agent-config/hooks/
│   └── symlink_skills.tmpl       # → agent-config/skills/
└── agent-config/                 # authored content (plain files, chezmoi-ignored)
    ├── CLAUDE.md                 # global Claude Code instructions
    ├── hooks/                    # shell hook scripts
    ├── skills/                   # custom skills
    ├── superpowers-overrides/    # patched superpowers plugin SKILL.md files
    └── docs/
        ├── websearch-routing-hook.md
        ├── playbooks/
        │   └── superpowers-patches.md
        └── specs/
```

`agent-config/` is listed in `.chezmoiignore`, so chezmoi treats it as if it
doesn't exist. Three templated symlinks under `dot_claude/` reach into it at
apply time, which keeps authored content as plain git-tracked files (no
two-phase edit loop) while still letting chezmoi own the `~/.claude/`
destination. See
[`agent-config/docs/specs/claude-config-consolidation-design.md`](agent-config/docs/specs/claude-config-consolidation-design.md)
for the full rationale.

After `chezmoi apply`, `~/.claude/` contains:

- `settings.json` — regular file, populated from the template
- `CLAUDE.md`, `hooks/`, `skills/` — symlinks into `agent-config/`

### Superpowers plugin overrides

Four skills under `agent-config/superpowers-overrides/` patch the superpowers
plugin. They are reached via hand-rolled symlinks in the plugin cache, which
have to be re-applied after each plugin update. See
[`agent-config/docs/playbooks/superpowers-patches.md`](agent-config/docs/playbooks/superpowers-patches.md)
for the re-apply procedure.

### Maintenance

**`settings.json` drift.** Claude Code rewrites `~/.claude/settings.json`
during normal use (enabling plugins, changing models, etc.). Periodically
reconcile the source with the destination:

```bash
chezmoi re-add ~/.claude/settings.json
cd ~/.local/share/chezmoi
git diff dot_claude/settings.json.tmpl
```

`re-add` flattens any template expressions in the round-trip, so after the
diff, re-introduce `{{ .chezmoi.homeDir }}` (or other template syntax) for
anything that should stay portable before committing.

**Superpowers plugin update.** When the superpowers plugin updates, merge
upstream changes into the override files and recreate the plugin-cache
symlinks. The full procedure lives in
[`agent-config/docs/playbooks/superpowers-patches.md`](agent-config/docs/playbooks/superpowers-patches.md).
