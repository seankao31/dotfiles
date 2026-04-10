# Claude Code Config Consolidation — Design

## Goal

Keep all authored Claude Code configuration — `CLAUDE.md`, hook scripts,
custom skills, superpowers plugin overrides, and design notes — in a single
git-tracked structure managed by `chezmoi`, while keeping day-to-day edit
friction low and making the system rebuildable from a clean state via
`chezmoi apply`.

## Core principle

> **Chezmoi is load-bearing only where its semantics match the problem.**

Chezmoi does three things of value: path translation (source → destination),
templating/encryption, and special file types (symlinks, permissions). If a
file needs *none* of those, putting it under chezmoi is pure friction —
every edit becomes a two-phase "edit source, `chezmoi apply`" loop.

Applied to this project:

| File                          | Authored by        | Churns externally? | Needs templating? | Verdict                              |
|-------------------------------|--------------------|--------------------|-------------------|--------------------------------------|
| `settings.json`               | Claude Code + user | **yes**            | yes (home path)   | Chezmoi template + copy-mode sync    |
| `CLAUDE.md`                   | user only          | no                 | no                | Chezmoi symlink into `agent-config/` |
| `hooks/*.sh`                  | user only          | no                 | no                | Chezmoi symlink (directory-level)    |
| `skills/` (custom skills)     | user only          | no                 | no                | Chezmoi symlink (directory-level)    |
| `superpowers-overrides/`      | user only          | no                 | no                | Plain files + hand-rolled symlinks from plugin cache |
| `docs/*`                      | user only          | no                 | no                | Plain files under `agent-config/`    |

Chezmoi is load-bearing for exactly two things in this project:

1. **One templated copy-mode file**: `settings.json.tmpl` — templated because
   it embeds a home-relative path, and copy-mode because Claude Code rewrites
   it externally and we reconcile via periodic `chezmoi re-add`.
2. **Three symlink_ files**: pointing `~/.claude/CLAUDE.md`, `~/.claude/hooks`,
   and `~/.claude/skills` into `agent-config/`.

Everything else is plain git-tracked files inside `agent-config/`, or
hand-rolled symlinks (plugin cache → overrides) that chezmoi cannot own
because their *source-side* path is volatile.

## Layout

```
~/.local/share/chezmoi/                         ← single git repo root
├── .chezmoiignore                              (content: "agent-config")
├── .gitignore                                  (.DS_Store, .env, .claude/, .worktrees/)
├── dot_claude/
│   ├── settings.json.tmpl                      ← templated copy mode
│   ├── symlink_CLAUDE.md.tmpl                  → {{ .chezmoi.sourceDir }}/agent-config/CLAUDE.md
│   ├── symlink_hooks.tmpl                      → {{ .chezmoi.sourceDir }}/agent-config/hooks
│   └── symlink_skills.tmpl                     → {{ .chezmoi.sourceDir }}/agent-config/skills
└── agent-config/                               ← chezmoi-ignored; plain git content
    ├── CLAUDE.md
    ├── hooks/                                  ← hook scripts
    ├── skills/                                 ← custom skills
    ├── superpowers-overrides/                  ← sibling of skills/, not child
    └── docs/
        ├── websearch-routing-hook.md           ← design note (knowledge)
        ├── playbooks/
        │   └── superpowers-patches.md          ← actionable, runs on each plugin update
        └── specs/                              ← design specs
```

### Layout rationale

- **Single repo, single history.** The chezmoi source directory IS the git
  repo root. `agent-config/` is a `.chezmoiignore`d subdirectory of the
  same repo, not a separate repo. This enables atomic commits that touch
  both chezmoi-managed files and plain content (e.g., "add a hook + its
  design note" is one commit, not two across repos).

- **`agent-config/` is the single home for authored content.** Every file
  the user writes by hand lives at exactly one path, inside `agent-config/`.
  Chezmoi creates the three symlinks that make `~/.claude/` point at the
  right places inside that tree.

- **`superpowers-overrides/` is a sibling of `skills/`, not a child.**
  Overrides aren't skills, and the superpowers plugin has other components
  (agents, hooks, commands) that may need overriding in the future. Keeping
  overrides at the `agent-config/` top level gives them room to grow without
  further reorganization. A new "override a superpowers agent" entry would
  land at `superpowers-overrides/agents/...` without disturbing the custom
  skills tree.

- **`docs/playbooks/` is a subdir even at N=1.** The subdir carries genuine
  type information: a playbook is *executed* (the merge instructions after
  a superpowers plugin update), not *read for reference*. This is worth
  surfacing in the layout even with a single entry.

## Component details

### `dot_claude/settings.json.tmpl` (templated copy mode)

- Populated via `chezmoi add` and then hand-edited to introduce
  `{{ .chezmoi.homeDir }}` in place of any hardcoded absolute home paths.
- Churn reconciliation: `chezmoi re-add ~/.claude/settings.json`, cadence
  is "periodic / after any intentional change" — end of session, before
  commits, or after enabling/disabling plugins via Claude Code.
- After `re-add`, re-introduce any templated values that were flattened by
  the round-trip (chezmoi's `re-add` writes back the rendered form).
- Workflow:
  ```
  chezmoi re-add ~/.claude/settings.json       # pull destination → source
  cd ~/.local/share/chezmoi
  git diff dot_claude/settings.json.tmpl       # inspect the drift; re-apply templates if needed
  git add dot_claude/settings.json.tmpl && git commit -m "sync settings.json drift"
  ```

### `dot_claude/symlink_*.tmpl` files

Three templated symlink source files, each containing a single line that
chezmoi evaluates at `chezmoi apply` time and uses as the symlink target:

- `symlink_CLAUDE.md.tmpl` → `{{ .chezmoi.sourceDir }}/agent-config/CLAUDE.md`
- `symlink_hooks.tmpl` → `{{ .chezmoi.sourceDir }}/agent-config/hooks`
- `symlink_skills.tmpl` → `{{ .chezmoi.sourceDir }}/agent-config/skills`

Templating with `{{ .chezmoi.sourceDir }}` is relocation-safe: if the
chezmoi source directory is ever moved, the symlinks re-resolve to the
new location on the next `chezmoi apply`.

### Plugin cache symlinks (not chezmoi-managed)

Four symlinks live inside the versioned superpowers plugin cache:

```
~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/<skill>/SKILL.md
   → ~/.local/share/chezmoi/agent-config/superpowers-overrides/<skill>/SKILL.md
```

For `<skill>` in: `brainstorming`, `finishing-a-development-branch`,
`subagent-driven-development`, `writing-plans`.

These cannot be chezmoi-managed because the plugin cache path is volatile
— every superpowers plugin update creates a new versioned cache directory.
`docs/playbooks/superpowers-patches.md` is the playbook for re-running the
`ln -sf` commands after each plugin update.

### `.chezmoiignore`

Single line:
```
agent-config
```

This excludes the entire `agent-config/` subtree from chezmoi's source
state. From chezmoi's point of view, the directory does not exist.
Chezmoi will never try to apply, template, or remove anything under it.

### `.gitignore`

At the repo root:
```
.DS_Store
.claude/
.env
.worktrees/
```

Repo-root placement (not `agent-config/.gitignore`) lets `.worktrees/`
exclude worktrees anywhere in the tree. `.claude/` prevents accidentally
committing the deployed destination copy.
