# Skill: Dev Container Terminal Workflow

Expert guidance for managing Dev Container CLI (`@devcontainers/cli`) without VS Code, specifically optimized for terminal-only use with iTerm2 and multiple sessions.

## Commands

- `devcontainer up --workspace-folder .` — Starts the container and executes lifecycle scripts (`postCreateCommand`).
- `devcontainer exec --workspace-folder . bash` — Opens an interactive shell inside the container.
- `devcontainer exec --workspace-folder . <cmd>` — Runs a specific command inside the container.
- `devcontainer down --workspace-folder .` — Stops and removes the container.

## Workflows

### 1. Terminal-Only Start
To start a dev environment from your host terminal:
```bash
devcontainer up --workspace-folder .
```
Wait for lifecycle scripts to complete. If the command blocks (it runs in the foreground by default), you can run it in the background:
```bash
devcontainer up --workspace-folder . < /dev/null &
```

### 2. Multiple Sessions with iTerm2
For users of iTerm2, the most powerful "multiple session" workflow is native `tmux` integration. This maps tmux windows to native iTerm2 tabs.

1. Ensure `tmux` is installed in the dev container (add to `features` or `postCreateCommand`).
2. Attach with iTerm2 Control Mode:
   ```bash
   devcontainer exec --workspace-folder . tmux -CC attach || \
   devcontainer exec --workspace-folder . tmux -CC
   ```

### 3. Alias Recommendation
Advise the user to add these to their `.zshrc` or `.bashrc`:
```bash
alias dcup='devcontainer up --workspace-folder .'
alias dcex='devcontainer exec --workspace-folder . bash'
alias dctmux='devcontainer exec --workspace-folder . tmux -CC'
```

## Guidance
- **Lifecycle Scripts**: Always use `devcontainer up` instead of `docker run` because it handles `postCreateCommand` and workspace mounts correctly.
- **Port Forwarding**: The CLI does not automatically manage port forwarding like VS Code. Use `-p` in `devcontainer.json` or external tools.
- **User Environment**: `devcontainer exec` correctly uses the `remoteUser` and environment variables defined in `devcontainer.json`.
