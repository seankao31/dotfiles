# Spec: Machine Config — Dev Container CLI Terminal Workflow

**Date:** 2026-04-13
**Status:** Draft
**Initiative:** Machine Config

## Context
The goal is to provide a "terminal only" workflow for [Dev Container CLI](https://github.com/devcontainers/cli) without VS Code, specifically optimized for iTerm2 users who need multiple concurrent sessions.

## Strategy
Leverage `devcontainer up` for lifecycle management and `devcontainer exec` with `tmux -CC` for iTerm2 native tab integration.

## Proposed Implementation

### 1. Shell Aliases & Functions
Add the following to the shell configuration (e.g., `~/.zshrc` or a `chezmoi` managed file):

```zsh
# Dev Container CLI Shortcuts
alias dcup='devcontainer up --workspace-folder .'
alias dcdown='devcontainer down --workspace-folder .'
alias dcread='devcontainer read-configuration --workspace-folder .'

# Execute a command in the container (defaults to bash)
dcex() {
  local cmd="${1:-bash}"
  devcontainer exec --workspace-folder . "$cmd"
}

# Advanced: Start an iTerm2 + tmux session inside the container
# This maps tmux windows to native iTerm2 tabs.
dctmux() {
  devcontainer exec --workspace-folder . tmux -CC attach || \
  devcontainer exec --workspace-folder . tmux -CC
}
```

### 2. Dev Container CLI Requirement
The workflow assumes `@devcontainers/cli` is installed globally:
```bash
npm install -g @devcontainers/cli
```

### 3. Agent Skill: `devcontainer-terminal`
A new skill will be added to `agent-config/skills/devcontainer-terminal/SKILL.md` to teach Claude Code how to:
- Use `devcontainer up` correctly (it runs in the foreground by default).
- Execute commands inside the container using `devcontainer exec`.
- Help the user manage multiple sessions via `tmux -CC` for iTerm2.

## Success Criteria
- [ ] `dcup` correctly starts the container and runs `postCreateCommand`.
- [ ] `dcex` provides an interactive shell.
- [ ] `dctmux` opens native iTerm2 tabs for each tmux window inside the container.
- [ ] Claude Code can autonomously help the user set up or debug this workflow.
