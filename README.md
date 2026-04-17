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
├── CLAUDE.md                     # repo-scoped instructions (loaded only when cwd is inside this repo)
├── dot_claude/                   # chezmoi source for ~/.claude/
│   ├── settings.json.tmpl        # templated copy-mode file
│   ├── symlink_CLAUDE.md.tmpl    # → agent-config/CLAUDE.md
│   ├── symlink_hooks.tmpl        # → agent-config/hooks/
│   └── symlink_skills.tmpl       # → agent-config/skills/
└── agent-config/                 # authored content (plain files, chezmoi-ignored)
    ├── CLAUDE.md                 # user-global Claude Code instructions (symlinked from ~/.claude/CLAUDE.md, loaded in every project)
    ├── hooks/                    # shell hook scripts
    ├── skills/                   # custom skills
    ├── superpowers-overrides/    # patched superpowers plugin SKILL.md files
    └── docs/
        ├── websearch-routing-hook.md
        ├── playbooks/
        │   └── superpowers-patches.md
        └── specs/
```

The two `CLAUDE.md` files serve different scopes: `agent-config/CLAUDE.md` is
user-global (symlinked into `~/.claude/`, applied in every Claude Code
session), while the repo-root `CLAUDE.md` only activates when the cwd is
inside this repo — use it for guidance that should not leak into unrelated
projects (e.g., this repo's Linear projects).

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
during normal use (enabling plugins, changing models, etc.). Because the
source is a template (`settings.json.tmpl`), `chezmoi re-add` refuses to
overwrite it — templates are silently skipped. Reconcile manually:

```bash
chezmoi diff ~/.claude/settings.json      # inspect what Claude Code changed
chezmoi edit ~/.claude/settings.json      # opens the .tmpl source in $EDITOR
chezmoi diff ~/.claude/settings.json      # confirm no drift remains
```

Apply the target's changes to the template by hand, preserving existing
template expressions (e.g. `{{ .chezmoi.homeDir }}`).

**Superpowers plugin update.** When the superpowers plugin updates, merge
upstream changes into the override files and recreate the plugin-cache
symlinks. The full procedure lives in
[`agent-config/docs/playbooks/superpowers-patches.md`](agent-config/docs/playbooks/superpowers-patches.md).
