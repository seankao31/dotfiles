# Git Workflow in Devcontainers

This playbook outlines the recommended approach for managing Git credentials and workflow when using Devcontainers, addressing common issues with SSH agents and credential bind mounts.

## Objective
Provide a seamless Git experience where you can commit and push from both the host machine and inside the Devcontainer, without manually copying SSH keys or passwords.

## Core Concepts

### 1. SSH Agent Forwarding (Recommended for SSH)
Instead of bind-mounting your `~/.ssh` directory (which often causes permission errors like `UNPROTECTED PRIVATE KEY FILE`), use SSH agent forwarding.

*   **Host Setup:** Ensure `ssh-agent` is running on your host machine and your key is added (`ssh-add ~/.ssh/id_ed25519`).
*   **Devcontainer Integration:** Tools like VS Code Dev Containers and GitHub Codespaces automatically detect the `SSH_AUTH_SOCK` environment variable on your host and forward the socket into the container.
*   **Verification:** Inside the container, run `ssh -T git@github.com`. It should authenticate using your host's key without needing the actual key file.

### 2. Git Credential Helpers (Recommended for HTTPS)
If you use HTTPS remotes, you want the container to use the host's stored credentials (e.g., macOS Keychain, Windows Credential Manager).

*   **VS Code Magic:** When using VS Code, it injects a custom git credential helper into the container (`git config --global credential.helper`). This helper communicates back to the host IDE to request the credentials.
*   **No Bind Mount Needed:** Do not bind mount `~/.git-credentials` or `~/.config/git/credentials`. The IDE's credential bridge handles this securely.

### 3. Git Configuration (`.gitconfig`)
*   **Automatic Sync:** Most Devcontainer tools automatically copy your host's `~/.gitconfig` into the container environment on creation.
*   **Chezmoi users:** If you manage your dotfiles with `chezmoi`, the host's `.gitconfig` is still copied. If you need Devcontainer-specific tweaks, you can run `chezmoi apply` inside the container if your Devcontainer setup includes it.

### 4. Committing and Pushing Workflow
Because the Devcontainer bind-mounts your project workspace directly from the host filesystem:
*   **From Container:** You can use terminal commands (`git commit`, `git push`) inside the container. This is useful for utilizing container-specific pre-commit hooks, linters, or formatters.
*   **From Host:** You can simultaneously use your host's IDE GUI or terminal to commit and push. The Git state (`.git/` folder) is shared perfectly between the host and container.
*   **Conflict Resolution:** There are no sync conflicts because both environments read/write to the exact same physical `.git` directory on the host's disk.

## Summary: What NOT to do
*   ❌ Do not bind mount `~/.ssh` into the container.
*   ❌ Do not bind mount `~/.gitconfig` manually (let the tool do it).
*   ❌ Do not copy private keys into the container workspace.
