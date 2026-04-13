# Claude Code Sandboxing Survey

_Last updated: 2026-04-13_

## Overview

Survey of sandboxing options for Claude Code, evaluated against three requirements:
1. Safe space to `--dangerously-skip-permissions` (restrict to project directory)
2. Experiment with plugins/settings/workflows without affecting working setup
3. (Nice-to-have) Portable dev environment across machines/cloud

---

## Option 1: Built-in Sandbox (`/sandbox` command)

**What it is:** OS-level sandboxing shipped with Claude Code. Uses Apple Seatbelt (`sandbox-exec`) on macOS, bubblewrap (`bwrap`) on Linux.

**How it works:**
- Filesystem: write-restricted to CWD by default; reads are broad but configurable via `sandbox.filesystem.*` in `settings.json`
- Network: proxy-based domain filtering with approval prompts
- All child processes inherit restrictions (kubectl, terraform, npm, etc.)
- Two modes: "Auto-allow" (sandboxed commands skip prompts) and "Regular permissions"

**Key limitation:** Only wraps Bash tool execution. The Read/Edit/Write tools use Claude Code's permission system, not the sandbox.

**`~/.claude/` handling:** Shared with host. No config isolation.

**Docs:** https://code.claude.com/docs/en/sandboxing

**Verdict:** Good for requirement #1 (safe skip-permissions for Bash commands). Does not address #2 (config isolation) or #3 (portability).

---

## Option 2: Official Devcontainer

**What it is:** Anthropic-published `.devcontainer/` with three files: `devcontainer.json`, `Dockerfile`, `init-firewall.sh`.

**How it works:**
- Container boundary provides full filesystem isolation
- Network: iptables default-deny policy, only allowlists GitHub, npm, api.anthropic.com, Sentry, VS Code marketplace
- Firewall validated on startup (confirms `example.com` is unreachable)
- Workspace is bind-mounted from host (edits appear instantly on both sides)

**`~/.claude/` handling:** Docker named volume, unique per container instance:
```json
"mounts": [
    "source=claude-code-config-${devcontainerId},target=/home/node/.claude,type=volume"
]
```
Config is **separate per container** -- not shared with host. Persists across restarts but isolated from production setup. `CLAUDE_CONFIG_DIR` is set to `/home/node/.claude`.

**`--dangerously-skip-permissions`:** Explicitly recommended by official docs inside the container.

**Terminal-only workflow (no VS Code required):**
```bash
npm install -g @devcontainers/cli

# Recommended aliases
alias dcup='devcontainer up --workspace-folder .'
alias dcex='devcontainer exec --workspace-folder .'
alias dcclaude='devcontainer exec --workspace-folder . claude'

# Daily workflow: dcup once, then dcclaude in each iTerm tab
dcup          # 5-15s if image cached, 2-5min first build
dcclaude      # each tab connects to same running container
```

**iTerm2 + tmux integration:** `devcontainer exec --workspace-folder . tmux -CC` maps tmux windows to native iTerm tabs.

**Friction points:**
- Must add personal tools to Dockerfile (ripgrep, fd, bat, etc. aren't included)
- SSH/GPG agent forwarding needed for git push
- macOS-isms (`pbcopy`, `open`, Finder) don't exist inside Linux container
- ~500MB-1GB RAM overhead per container
- Container lifecycle management (remember to `dcup` after Docker restart)

**Docs:** https://code.claude.com/docs/en/devcontainer

**Verdict:** Best overall fit today. Addresses all three requirements. Moderate workflow friction.

---

## Option 3: Claude Code on the Web (claude.ai/code)

**What it is:** Each session runs in an isolated, Anthropic-managed VM. Fresh repo clone per session.

**Resources:** ~4 vCPUs, 16 GB RAM, 30 GB disk.

**`~/.claude/` handling:** Not available at all. User `CLAUDE.md`, MCP servers, plugins -- none of it. Only project-level config (checked into repo) is available.

**Network isolation:** Four levels: None, Trusted (default), Full, Custom. GitHub tokens never enter the sandbox (secure proxy).

**Docs:** https://code.claude.com/docs/en/claude-code-on-the-web

**Verdict:** Maximum isolation, minimum customization. Good for one-off autonomous tasks, not for daily development.

---

## Option 4: Docker `sbx` (Experimental)

**What it is:** Docker Sandboxes -- hypervisor-backed microVMs for AI agents. Standalone CLI (`sbx`) or Docker Desktop plugin (`docker sandbox`, requires Desktop 4.58+).

**Status:** Experimental. Latest release v0.24.2 (2026-04-08). Rapid development (5 releases in 2 weeks). GitHub: https://github.com/docker/sbx-releases (created 2026-03-03).

**Four isolation layers:**
1. Hypervisor (own kernel per sandbox -- macOS: `virtualization.framework`, Linux: KVM, Windows: Hyper-V)
2. Network (HTTP/S proxied, raw TCP/UDP/ICMP blocked, deny-by-default)
3. Docker Engine (own daemon per sandbox, separate from host)
4. Credentials (API keys injected via host-side proxy -- never enter the VM)

**Key commands:**
```bash
brew install docker/tap/sbx           # Install (may not be in tap yet)
sbx login                             # OAuth sign-in
sbx secret set -g anthropic           # Store API key in OS keychain
sbx run claude                        # Launch Claude Code sandbox
sbx run claude ~/my-project           # With specific project
sbx run claude --branch my-feature    # Git worktree mode
sbx ls                                # List sandboxes
sbx exec -it <name> bash              # Shell into sandbox
sbx policy ls                         # Show network rules
sbx policy allow network <domain>     # Allowlist a domain
```

**Network policy presets:** Open, Balanced (recommended), Locked Down.

**`~/.claude/` handling:** NOT available. From docs: "Sandboxes don't pick up user-level agent configuration from your host." Only project-level config is available. Workaround: copy config files into project directory before launch.

**Branch mode:** `sbx run claude --branch my-feature` creates a git worktree under `.sbx/` -- agent works on its own branch.

**Base image:** `docker/sandbox-templates:claude-code` -- runs with `--dangerously-skip-permissions` by default.

**Docs URL:** https://docs.docker.com/ai/sandboxes (listed as homepage but was returning 404 as of 2026-04-13; docs source exists in `docker/docs` repo).

**Verdict:** Strongest isolation (hypervisor > container). Best UX (`sbx run claude` is dead simple). But experimental, no config replication, and `~/.claude/` gap is a dealbreaker for requirement #2 today.

---

## Option 5: Community Solutions

### numtide/claudebox
- Uses bwrap/seatbelt (same primitives as built-in sandbox)
- Shares `~/.claude/` with host (no config isolation)
- Blocks DBus, GPG, GNOME Keyring, Wayland, systemd sockets
- Install via Nix: `nix run github:numtide/claudebox`
- Explicitly NOT a security boundary
- GitHub: https://github.com/numtide/claudebox

### Trail of Bits devcontainer
- Security-hardened Docker setup for security audit workflows
- `~/.claude` is a persistent Docker volume (separate from host)
- `~/.config/gh` also persisted in a volume
- Optional iptables network restrictions
- Multi-engagement isolation (separate per-project containers)
- GitHub: https://github.com/trailofbits/claude-code-devcontainer

---

## Comparison Matrix

| | Built-in `/sandbox` | Devcontainer | Web (claude.ai/code) | Docker `sbx` | claudebox | Trail of Bits |
|---|---|---|---|---|---|---|
| **Isolation** | OS sandbox (Bash only) | Container | VM | Hypervisor (microVM) | OS sandbox | Container |
| **`~/.claude/`** | Shared | Separate volume | Not available | Not available | Shared | Separate volume |
| **Credential safety** | On host | Env var in container | Secure proxy | Proxy-injected | On host | Env var |
| **Network** | Proxy + domain filter | iptables deny-all | Configurable | Proxy + deny-default | None | Optional iptables |
| **Workflow change** | None | Moderate | Complete | Low | None | Moderate |
| **Config isolation** | No | Yes | N/A | No | No | Yes |
| **Portability** | No | Yes (Dockerfile) | Browser only | Partial | No | Yes |
| **Maturity** | GA | Stable | GA | Experimental | Community | Community |
| **Safe skip-permissions** | Partial (Bash only) | Yes | Implicit | Yes | Partial | Yes |

---

## What Constitutes "Your Claude Code Setup"

### Must replicate (defines the setup)
- `~/.claude/settings.json` -- hooks, plugins, effort, statusLine
- `~/.claude/CLAUDE.md` -- global instructions (chezmoi symlink target)
- `~/.claude/skills/` -- custom skills (chezmoi symlink target)
- `~/.claude/hooks/` -- pre/post tool hooks (chezmoi symlink target)
- Plugin list from `enabledPlugins` + `extraKnownMarketplaces` in settings.json
- Project-level `.claude/settings.json`, `.claude/settings.local.json`, `CLAUDE.md`
- Environment variables (e.g., `ANTHROPIC_DEFAULT_OPUS_MODEL`)

### Must NOT replicate (machine/identity specific)
- `~/.claude.json` -- identity, OAuth account, usage stats, feature flags
- Keychain entries (`Claude Code-credentials`, `Claude Safe Storage`)
- `~/.claude/sessions/`, `session-env/`, `shell-snapshots/`, `file-history/`, `backups/`
- `~/.claude/history.jsonl`, `telemetry/`, `stats-cache.json`, `plans/`, `debug/`
- `~/.claude/plugins/cache/` and `marketplaces/` (re-fetched on plugin install)

### Needs fresh setup (cannot copy)
- Authentication -- `claude login` or `ANTHROPIC_API_KEY`
- Cloud MCP connections (Linear, Gmail, Calendar) -- server-side OAuth, need re-auth
- Plugin installation -- `claude plugin install` for each enabled plugin

### MCP server storage
- Cloud-managed MCPs (Linear, Gmail): server-side on Anthropic account, not stored locally
- Plugin-provided MCPs (context7, playwright, svelte): defined in plugin manifests, auto-configured on install
- User-added MCPs (`claude mcp add`): written to `mcpServers` in `~/.claude.json`
- Project-level MCPs: per-project `mcpServers` in `~/.claude.json` projects map
