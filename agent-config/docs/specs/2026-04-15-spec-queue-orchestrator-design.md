# Autonomous Spec-Queue Orchestrator (Ralph Loop)

**Linear issue:** ENG-151
**Date:** 2026-04-15

## Problem

Each Claude Code session currently requires the user to be present for brainstorming
and spec review, then again at the end to review completed work. The
machine-dependent phase (implementation) is sandwiched between two
human-dependent phases, meaning Claude can only work when the user is at the desk.

The goal is to decouple these phases: brainstorm and approve specs while at the
desk, then let an orchestrator consume the queue of pre-approved specs
autonomously while the user is away. On return, the user reviews completed work
interactively in each worktree — the same review flow he uses today.

## Research: Existing Solutions

### Community "ralph" implementations

Three open-source projects implement variations of the "ralph" autonomous loop
pattern for Claude Code:

**Anthropic's ralph-wiggum plugin**
(`github.com/anthropics/claude-code/plugins/ralph-wiggum`)
A simple bash loop that re-feeds the same prompt to Claude via a stop-hook.
Claude works on a task, attempts to exit, the hook intercepts and re-feeds the
prompt, creating a self-referential iteration loop. Terminates on a
`--completion-promise` string match or `--max-iterations`. Single-task only —
no queue, no multi-task orchestration, no worktree isolation.

**frankbria/ralph-claude-code**
The most production-hardened variant. Adds: circuit breaker pattern (stagnation
detection after N loops with no file changes or repeated errors, three-state
machine with auto-recovery), dual-track rate limiting (hourly call count +
token budget), three-layer API limit detection (timeout guard, structured JSON,
filtered text fallback), dual-condition exit gate (heuristic completion
indicators + explicit EXIT_SIGNAL), two-stage error filtering (structural +
contextual to avoid false positives), session continuity across iterations, tmux
monitoring integration. Still fundamentally a single-task iteration loop — no
queue or dependency awareness.

**snarktank/ralph** (`github.com/snarktank/ralph`)
Closest to multi-task: iterates through a `prd.json` list of user stories, one
fresh instance per iteration. Tracks completion via prd.json status flags and an
append-only `progress.txt` knowledge log. Supports both Amp CLI and Claude Code.
Sequential only — no DAG ordering, no worktree isolation, no conflict detection.

**Assessment:** All three solve the wrong problem. They are single-task iteration
loops ("retry until one task works") or sequential story processors. ENG-151
needs a multi-task queue consumer with dependency awareness. frankbria's
production-hardening features (circuit breaker, rate limiting, exit detection)
are impressive but designed for the iteration model — in our one-shot-per-spec
model, most are irrelevant because each spec gets a single `claude -p`
invocation, not repeated retries.

The one pattern worth noting from snarktank: **fresh instance per iteration**.
Each spec gets a clean context window, with continuity maintained through files
(git history, progress logs, Linear status) rather than conversation memory.
This aligns with our design.

### Claude Code Routines (announced 2026-04-14)

Anthropic's new cloud-based automation feature. A routine packages a prompt,
repositories, and MCP connectors into a configuration that runs on Anthropic's
cloud infrastructure. Three trigger types: scheduled (cron, minimum 1 hour),
API-driven (POST to `/fire` endpoint with text payload), and GitHub webhooks.

**What Routines provide:**
- Fresh isolated cloud session per run (own git clone)
- `claude/`-prefixed branches by default
- MCP connectors (Linear, Slack, etc.)
- Cloud environment with setup scripts, env vars, network access control
- Session URL for reviewing results; PR creation from web UI
- Works while laptop is closed

**What carries over to cloud sessions:**
- Repo's CLAUDE.md, `.claude/settings.json` hooks, `.claude/skills/`,
  `.claude/agents/`, `.claude/commands/`, `.claude/rules/` — all part of clone
- Plugins declared in `.claude/settings.json` — installed from marketplace
- `.mcp.json` MCP servers

**What does NOT carry over:**
- User-level `~/.claude/CLAUDE.md` (lives on local machine)
- User-only plugins (must be declared in repo's `.claude/settings.json`)
- MCP servers added via `claude mcp add` (local config; use `.mcp.json`)
- Static API tokens (no dedicated secrets store yet)

**Cloud environment resources:** 4 vCPUs, 16GB RAM, 30GB disk per session.

**Assessment:** Routines could serve as the execution engine (replacing local
`claude -p` invocations), but require: GitHub + Linear MCP connectors, cloud
environment setup, daily run cap (amount unspecified). More importantly, the user
prefers a local setup that could later move to a remote server he owns — not
Anthropic's cloud. Routines are a strong v2/v3 option if the local orchestrator
proves insufficient, but not the right foundation for v1.

### Agent Teams (experimental)

Multiple Claude Code instances coordinating via a shared task list with
dependency tracking, inter-agent messaging, and a lead that coordinates work.
Teammates can claim tasks, and tasks can have dependencies (blocked tasks
auto-unblock when dependencies complete). Has hooks for quality gates
(`TaskCreated`, `TaskCompleted`, `TeammateIdle`).

**Assessment:** Architecturally close to ENG-151's DAG-aware coordinator, but:
experimental (disabled by default), local-only (no cloud persistence), designed
for interactive collaborative work within one sitting (not a persistent queue
processor), has known limitations (no session resumption, one team per session,
no nested teams). Wrong abstraction for autonomous overnight queue processing.

### Ultraplan

Plan in the cloud while the terminal stays free. Draft → review in browser with
inline comments → execute remotely or locally. The "plan locally, execute
remotely" pattern.

**Assessment:** Could complement the "while at desk" phase (brainstorm → ultraplan
→ approve), but doesn't address autonomous queue consumption. Orthogonal to
ENG-151's core problem.

### Native `--worktree` CLI flag

`claude --worktree [name]` creates a new git worktree for the session at launch.
Scriptable — a bash script can call it programmatically. Composes with `-p`
(print mode) and `--name` (session naming). Sessions are persisted by default
and resumable via `claude --resume`.

### Native sandbox

Claude Code now has built-in OS-level sandboxing (Seatbelt on macOS, bubblewrap
on Linux). Configurable in `.claude/settings.json`. Enforces filesystem and
network isolation at the kernel level, applies to all subprocesses. Even with
`--dangerously-skip-permissions`, sandbox restrictions still apply because
they're enforced by the OS, not by Claude.

## Design Decisions

### 1. Fresh instance per spec (not session continuity)

Each spec gets its own `claude -p` invocation with a clean context window.
Continuity between specs is maintained through Linear (issue status,
dependencies), git (commits, branches), and a progress file — not conversation
memory.

**Rationale:** Eliminates cross-spec context pollution, simplifies failure
isolation (a crashed session doesn't corrupt orchestrator state), avoids context
compaction issues, and matches the natural boundary of "one spec = one unit of
work."

### 2. Local execution (not cloud Routines)

The orchestrator runs locally (or on a remote server the user owns), not on
Anthropic's cloud.

**Rationale:** the user prefers local control with the option to move to their own
server. Avoids cloud-specific constraints (daily run caps, MCP connector setup,
no user-level CLAUDE.md). All local settings, plugins, and skills are available.

### 3. Custom bash script (not ralph)

A purpose-built orchestrator script rather than adapting an existing ralph
implementation.

**Rationale:** The ralph implementations solve a different problem (iterate on one
task until done) vs. our model (dispatch a sequence of right-sized specs, one
shot each). frankbria's production hardening (circuit breaker, exit detection,
error filtering) is designed for the iteration model and doesn't transfer.
snarktank's multi-story iteration is the closest fit, but adapting its prd.json
format and completion tracking to work with Linear issues adds more complexity
than writing the ~100-line dispatch loop directly. The orchestrator should be
deterministic code (sort tasks, dispatch sessions, track results), not LLM
behavior.

### 4. Native sandbox (not devcontainer)

OS-level sandboxing via Claude Code's built-in sandbox feature, not container
isolation.

**Rationale:** Simpler — no container startup overhead, no auth credential
forwarding, works directly with `--worktree`. Seatbelt (macOS) and bubblewrap
(Linux) provide kernel-level filesystem and network isolation. Even with
`--dangerously-skip-permissions`, Claude cannot access files outside the
worktree or make network calls to unapproved domains. Devcontainers remain a
viable additional layer for the future remote server scenario.

### 5. Sequential execution (not parallel)

Specs are processed one at a time in topological order.

**Rationale:** v1 simplicity. Eliminates conflict detection complexity (no need
for file manifests), worktree contention, and merge ordering. The orchestrator
is a simple `for` loop. Parallelism is a natural v2 extension once the
sequential flow is proven.

### 6. Stop on failure (not skip-and-continue)

When a spec fails, the orchestrator stops processing the queue.

**Rationale:** v1 simplicity. Avoids the complexity of dependency-aware failure
propagation (if spec A fails, which downstream specs should be skipped vs.
proceeded?). The user reviews the failure interactively and decides how to proceed.
The partial progress (completed specs) is already committed and available.

### 7. Plugin architecture with adapter pattern

The orchestrator is a Claude Code plugin with a pluggable task source adapter.

**Rationale:** The core dispatch loop (sort tasks → spawn sessions → track
results) is generic. The Linear-specific parts (query issues, read dependencies,
update status) are isolated in an adapter. This allows future task sources
(GitHub Issues, Jira, plain file queue) without changing the core logic. For v1,
only the Linear adapter ships.

### 8. No PR creation, no automated merging

The orchestrator never creates PRs or merges branches. It leaves completed work
in worktrees for the user to review.

**Rationale:** Preserves the user's existing review flow: open an interactive Claude
Code session in the worktree, review the diff, suggest fixes, then merge via
`finishing-a-development-branch`. The orchestrator handles the grunt work
(implementation); the human handles the judgment (review and integration).

### 9. Resumable sessions

Each spec's Claude Code session is persisted and named after the Linear issue.
The user can resume any session to see what Claude did and continue the conversation.

**Rationale:** Critical for both success and failure cases. On success: the user
resumes to review with full conversation context. On failure: the user resumes to
see exactly where Claude got stuck and continue debugging from that point. The
worktree has the partial work; the session has the reasoning.

## Architecture

### Workflow

```
┌─────────────────────────────────────────────────────┐
│                  WHILE AT DESK                       │
│                                                      │
│  Brainstorm → Spec → Approve → Linear "Approved"    │
│  (repeat for multiple specs, set dependencies)       │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  WHILE AWAY                          │
│                                                      │
│  /run-queue                                          │
│    ├─ Query Linear for "Approved" specs              │
│    ├─ Topological sort by blocked-by relations       │
│    ├─ Filter to specs whose deps are all "Done"      │
│    └─ For each ready spec (sequential):              │
│        ├─ claude -p --worktree --name --sandbox      │
│        ├─ On success: Linear → "Review"              │
│        ├─ On failure: Linear → "Failed", STOP        │
│        └─ Write progress to progress.json            │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│                  WHEN BACK                           │
│                                                      │
│  For each completed spec:                            │
│    cd .worktrees/eng-XXX                             │
│    claude --resume "ENG-XXX"                         │
│    Review → Fix → /finishing-a-development-branch    │
│                                                      │
│  For failed spec (if any):                           │
│    cd .worktrees/eng-XXX                             │
│    claude --resume "ENG-XXX"                         │
│    Debug → Fix → continue or abandon                 │
└─────────────────────────────────────────────────────┘
```

### Plugin structure

```
spec-queue/
├── PLUGIN.md                          # Plugin metadata
├── skills/
│   └── run-queue/
│       └── SKILL.md                   # /run-queue skill entry point
├── scripts/
│   ├── orchestrator.sh                # Core dispatch loop (generic)
│   ├── toposort.sh                    # Topological sort (generic)
│   └── adapters/
│       └── linear.sh                  # Linear: query, sort deps, update status
└── config.example.json                # Configuration template
```

### Components

#### 1. Skill entry point (`/run-queue`)

A `disable-model-invocation: true` skill that the user invokes manually before
stepping away. It:
1. Reads configuration (which project, what statuses, budget per spec)
2. Runs the orchestrator in dry-run mode: shows the queue (ordered specs with
   dependencies) and asks for confirmation
3. On confirmation, starts the orchestrator script

#### 2. Orchestrator script (`orchestrator.sh`)

The core dispatch loop. Receives an ordered list of specs (from the adapter) and
processes them sequentially:

```bash
for each spec in ordered_list:
    record start time in progress.json
    branch_name = spec.branch_name    # from Linear's auto-generated branch
    session_name = spec.issue_id + ": " + spec.title

    claude -p \
        --worktree "$branch_name" \
        --name "$session_name" \
        --dangerously-skip-permissions \
        --max-budget-usd "$budget_per_spec" \
        "$prompt_template with spec details"

    exit_code = $?

    if exit_code == 0:
        adapter.update_status(spec, "Review")
        record success in progress.json
    else:
        adapter.update_status(spec, "Failed")
        record failure in progress.json
        exit 1   # stop on failure
```

The script is intentionally simple — no retry logic, no circuit breakers, no
completion detection. Those are v2 concerns. The script trusts `claude -p` to
either succeed (exit 0) or fail (non-zero exit), and acts accordingly.

If the queue is empty (no approved specs, or all approved specs have unresolved
dependencies), the orchestrator exits cleanly with a message — not an error.

#### 3. Topological sort (`toposort.sh`)

Receives a list of specs with their dependency relations and outputs them in
execution order. Uses Kahn's algorithm:
1. Build adjacency list from `blocked-by` relations
2. Find all specs with no unresolved dependencies (in-degree 0)
3. Process them in priority order (Linear priority field)
4. As each spec is "processed," decrement in-degree of dependents
5. Repeat until all specs are ordered or a cycle is detected

Specs whose dependencies are not all in "Done" status are filtered out — they
aren't ready for execution regardless of topological position.

#### 4. Linear adapter (`adapters/linear.sh`)

Handles all Linear-specific operations:
- **Query:** `linear issue query` for issues in "Approved" status within the
  configured project
- **Dependencies:** `linear issue view --json` to read `blocked-by` relations
  for each issue; feed into toposort
- **Spec location:** Extract design doc path from issue description (convention:
  a markdown link to `docs/specs/...` or `agent-config/docs/specs/...`)
- **Status updates:** `linear issue update --state "Review"` on success,
  `--state "Failed"` on failure
- **Branch name:** Use Linear's auto-generated branch name
  (e.g., `eng-152-add-swap-stats-input`)

#### 5. Configuration (`config.json`)

```json
{
    "task_source": "linear",
    "linear": {
        "project": "Agent Config",
        "approved_status": "Approved",
        "review_status": "Review",
        "failed_status": "Failed",
        "done_status": "Done"
    },
    "execution": {
        "budget_per_spec_usd": 5.00,
        "model": "opus",
        "stop_on_failure": true
    },
    "prompt_template": "You are autonomously implementing Linear issue $ISSUE_ID: \"$ISSUE_TITLE\".\n\nDesign spec: $SPEC_PATH\n\nRead the spec and implement it fully. Follow the project's CLAUDE.md instructions.\nCommit frequently with clear messages. When done, ensure all tests pass."
}
```

The `prompt_template` is deliberately minimal. The project's CLAUDE.md already
contains all methodology instructions (TDD, commit style, review gates, etc.).
The orchestrator just points Claude at the spec and gets out of the way.

Users who want Claude to invoke specific skills (e.g., `/writing-plans` →
`/subagent-driven-development`) can add that to their prompt template in config.

#### 6. Sandbox configuration

The plugin should document (and optionally ship) recommended sandbox settings
for autonomous operation. These go in the project's `.claude/settings.json`:

```json
{
    "sandbox": {
        "enabled": true,
        "filesystem": {
            "denyRead": ["~/"],
            "allowRead": ["."],
            "allowWrite": ["."]
        }
    }
}
```

This ensures that even with `--dangerously-skip-permissions`:
- Filesystem writes are restricted to the worktree directory
- Reads are restricted to the project (no access to `~/.ssh`, `~/.bashrc`, etc.)
- Network access follows the sandbox's domain allowlist (package registries,
  GitHub by default)

#### 7. Progress file (`progress.json`)

Written after each spec completes or fails. Provides a summary for the user on
return:

```json
{
    "run_id": "2026-04-15T22:30:00+08:00",
    "specs_attempted": 3,
    "specs_completed": 2,
    "specs_failed": 1,
    "results": [
        {
            "issue_id": "ENG-152",
            "title": "Add swap stats input",
            "status": "completed",
            "session_name": "ENG-152: Add swap stats input",
            "worktree": ".worktrees/eng-152-add-swap-stats-input",
            "branch": "eng-152-add-swap-stats-input",
            "started_at": "2026-04-15T22:30:00+08:00",
            "completed_at": "2026-04-15T23:15:00+08:00",
            "exit_code": 0
        },
        {
            "issue_id": "ENG-153",
            "title": "Fix card display regression",
            "status": "completed",
            "session_name": "ENG-153: Fix card display regression",
            "worktree": ".worktrees/eng-153-fix-card-display-regression",
            "branch": "eng-153-fix-card-display-regression",
            "started_at": "2026-04-15T23:16:00+08:00",
            "completed_at": "2026-04-15T23:45:00+08:00",
            "exit_code": 0
        },
        {
            "issue_id": "ENG-154",
            "title": "Add party composition tracker",
            "status": "failed",
            "session_name": "ENG-154: Add party composition tracker",
            "worktree": ".worktrees/eng-154-add-party-composition-tracker",
            "branch": "eng-154-add-party-composition-tracker",
            "started_at": "2026-04-15T23:46:00+08:00",
            "completed_at": "2026-04-16T00:30:00+08:00",
            "exit_code": 1
        }
    ]
}
```

### Spec readiness criteria

A spec is "ready for the queue" when:
1. Linear issue is in "Approved" status
2. All `blocked-by` issues are in "Done" status
3. Issue description contains a path to a committed design doc (or the
   description itself serves as the spec for simpler tasks)

The orchestrator filters for conditions 1 and 2 automatically. Condition 3 is a
convention enforced during the brainstorming phase — the design doc path is
included in the issue description when the spec is written.

### Review flow (unchanged from today)

When the user returns, they see:
- `progress.json` with a summary of what happened
- N worktrees with completed/failed work
- Linear issues in "Review" or "Failed" status

For each spec, the review process is identical to today:

```bash
cd .worktrees/eng-152-add-swap-stats-input
claude --resume "ENG-152: Add swap stats input"
# Full conversation context available
# Review the diff, suggest fixes, iterate
# When satisfied: /finishing-a-development-branch
```

The orchestrator has no role in review or merging. It only does implementation.

## Out of scope (v1)

- **Parallel execution:** Process specs concurrently in multiple worktrees.
  Natural v2 extension — the topological sort already identifies independent
  specs that could run in parallel.
- **Retry logic / circuit breakers:** Retry failed specs with backoff, detect
  stagnation. Useful for long-running autonomous operation, but for v1
  stop-on-failure is simpler and matches the "review on return" model.
- **PR creation:** Automatically create PRs for completed specs. Not needed —
  the user creates PRs as part of their interactive review.
- **Automated merging:** Merge completed specs to main in DAG order. Explicitly
  excluded — the user merges manually after review.
- **Conflict detection:** File manifest comparison to detect specs that touch the
  same files. Not needed in sequential mode; becomes relevant with parallelism.
- **Cloud execution (Routines):** Run specs on Anthropic's cloud instead of
  locally. Viable future option, especially for the remote server scenario.
- **Multiple task source adapters:** GitHub Issues, Jira, file-based queue.
  Plugin architecture supports this, but only the Linear adapter ships in v1.
- **Cost tracking / reporting:** Aggregate API costs per spec and per run.
  `--max-budget-usd` provides per-spec caps, but no post-run cost summary.

## Open questions

1. **`--worktree` flag behavior:** The native `--worktree` flag's exact
   directory selection logic needs verification. Does it respect the
   `.worktrees` directory convention from the `using-git-worktrees` skill, or
   does it use its own default location? This affects worktree cleanup and
   the user's ability to `cd` into them.

2. **`--max-budget-usd` exit behavior:** When the budget is exhausted, does
   `claude -p` exit with a non-zero code? If it exits 0 with incomplete work,
   the orchestrator would incorrectly mark the spec as completed. Needs testing.

3. **Linear "Approved" status:** This status doesn't exist in the current Linear
   workflow. Either create it, or repurpose an existing status (e.g., "Todo"
   with a specific label like `queue-ready`). Decision deferred to
   implementation.

4. **Prompt template tuning:** The minimal prompt template ("read the spec and
   implement it") relies on CLAUDE.md for methodology. This may need iteration —
   autonomous sessions might benefit from more explicit instructions about skill
   invocation order, commit granularity, or test expectations. The config file
   makes this easy to adjust.

5. **Session output capture:** `claude -p` prints its response to stdout. Should
   the orchestrator capture this output to a log file per spec? Useful for
   debugging failures without resuming the session, but adds I/O complexity.
   Leaning toward capturing stdout to
   `.worktrees/<branch>/orchestrator-output.log`.
