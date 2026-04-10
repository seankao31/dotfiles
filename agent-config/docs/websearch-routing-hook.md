# Routing WebSearch Through Gemini with a Graceful Fallback

## The Problem

Claude Code's built-in `WebSearch` tool is ungrounded — the model generates what it thinks the search results would look like. For research, Gemini CLI is strictly better because its `-p` mode runs actual Google Search with grounding. But delegating every web query to Gemini has a bright-line cost: Gemini's free-tier rate limits can hit mid-session, and when they do the research subagent gets a single-pass result instead of the multi-pass pattern the context-efficient delegation skill relies on. Losing research capability mid-session is worse than using the weaker tool.

We want both: prefer Gemini when it's available, fall back to WebSearch when it isn't, and don't ask the user to flip any switches.

## Why a Hook, Not a Prompt Rule

Tool-routing rules are categorically different from process or style rules. "Use TDD" or "write comments explaining why" describe how the model should *think*; the model can internalize them and still violate them, and that's acceptable — style rules are advisory. But "don't call WebSearch, call `gemini -p` instead" is about *which tools are allowed to run*. A prompt-based rule depends on the model remembering and on the skill dispatcher firing; a hook runs unconditionally in the harness before the tool executes. Hooks give deterministic enforcement that prompts cannot.

We already had this rule as a paragraph in `~/.claude/CLAUDE.md`. Moving it to a hook let us delete those lines and, more importantly, made the rule un-forgettable.

## The Solution

Two scripts that communicate through a filesystem marker:

1. **`block-websearch.sh`** — PreToolUse hook on `WebSearch`. By default, denies and tells the model to call `gemini-research.sh` instead. Allows WebSearch through iff a "Gemini is degraded" marker file is fresh.
2. **`gemini-research.sh`** — thin wrapper around `gemini -p`. On success, removes the marker. On any non-zero exit, touches the marker and emits stderr guidance telling the model to retry with WebSearch.

The marker lives at `/tmp/claude-gemini-rate-limited` with a 30-minute stale window checked via `find -mmin -30`.

## Design Decision 1: Filesystem Marker, Not In-Memory State

The router (hook) and the wrapper (wrapper script) are two different processes. They can't share memory, and the hook runs fresh on every WebSearch attempt. The simplest IPC between them is a file: the wrapper writes it, the hook reads it. No daemon, no server, no env var plumbing.

`/tmp` was chosen over `~/.claude/state/` because the marker is genuinely ephemeral — it should reset on reboot (gemini rate limits reset on a timer that's almost always shorter than a reboot cycle) and doesn't need to be backed up.

## Design Decision 2: Any Non-Zero Exit Counts as Failure

The wrapper could `grep` Gemini's stderr for "rate limit" or "quota" to only trip on specific failure modes. We rejected this: pattern-matching error strings is brittle (Google changes them), and the cost of a false negative — failing to fall back when Gemini is actually broken — is worse than the cost of a false positive (falling back when Gemini was fine but the query was bad). A transient CLI error, a network blip, or a genuine rate-limit all land in the same bucket: "Gemini didn't return an answer, use WebSearch."

## Design Decision 3: 30-Minute Stale Window

Short enough to recover quickly once Gemini is healthy again. Long enough to not retry Gemini during a sustained outage — which would mean every WebSearch call in the affected subagent pays a full Gemini timeout before falling back. Thirty minutes roughly matches the upper bound of a typical rate-limit cooldown while still letting the preferred routing return same-session.

Importantly, the stale check is a *safety net*, not the primary reset. The primary reset is self-healing: the next successful Gemini call through the wrapper removes the marker, no wait needed. The 30-minute fallback only matters if the wrapper is never run again (e.g. the session pivots away from research).

## Design Decision 4: No CLAUDE.md Note

The wrapper's stderr message on failure is the only place the retry pattern is documented:

```
gemini-research failed (exit N — likely rate-limited or offline). Retry
by calling WebSearch directly: the WebSearch hook will allow it for
the next 30 minutes.
```

This loads at the moment the information is needed, costs zero tokens otherwise, and lives next to the code that actually controls the behavior. A CLAUDE.md note would cost tokens every turn and could drift out of sync with the script.

The deny message from the hook itself points at `~/.claude/hooks/gemini-research.sh`, so the model learns the preferred path on its first WebSearch attempt too.

## Design Decision 5: Replace the Disabled Hook, Not A/B

An intermediate version of `block-websearch.sh` had a `DISABLED=true` flag that early-exited. It was born when the Gemini rate limit first bit us and we wanted to turn the hook off without deleting it. The smart router makes that flag obsolete — "degraded Gemini" is now a first-class state the script handles on its own. Keeping both as an A/B toggle would just be two places to edit when the design evolves.

## Architecture

```
~/.claude/
├── settings.json                       # Registers PreToolUse → WebSearch hook
└── hooks/
    ├── block-websearch.sh              # Router: marker-fresh → allow, else deny
    └── gemini-research.sh              # Wrapper: call gemini, manage marker

/tmp/claude-gemini-rate-limited         # Marker file (touched on failure, rm'd on success)
```

### The Four-State Matrix

| Gemini state this session  | Marker                  | Router verdict          | What the model does                   |
|----------------------------|-------------------------|-------------------------|----------------------------------------|
| Healthy (last call worked) | Absent                  | Deny, reroute to wrapper | Call wrapper → real Gemini result     |
| Unknown (no recent call)   | Absent                  | Deny, reroute to wrapper | Call wrapper → discovers state        |
| Recently failed            | Present, < 30 min old   | Allow                    | WebSearch runs as fallback            |
| Failed long ago            | Present, > 30 min old   | Deny, reroute to wrapper | Call wrapper → retries Gemini         |

The third row is the only state where WebSearch actually runs. Every other state tries Gemini first, which is what we want.

## What This Doesn't Do

- **Doesn't distinguish failure types.** A bad query that Gemini refuses trips the same marker as a rate limit. The cost is one extra WebSearch fallback before the next successful Gemini call resets the state.
- **Doesn't probe Gemini health proactively.** No background pings, no health check. Only real research calls update the marker. This keeps the hook's latency at zero.
- **Doesn't block WebSearch when the fallback is inappropriate.** If Gemini is genuinely broken and WebSearch's ungrounded results are worse than no results, the model will still use WebSearch. That's a judgment call the model has to make from the wrapper's stderr message.
- **Doesn't reset on session start.** The marker is user-wide and time-based; a new Claude session inherits whatever state the previous one left. This is intentional — if Gemini was degraded 10 minutes ago, it's probably still degraded now.
