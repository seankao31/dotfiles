#!/bin/bash
# Smart router for WebSearch:
#   - Default: block WebSearch and route the model to `gemini-research.sh`
#     (grounded Google Search via Gemini CLI, preferred over raw WebSearch).
#   - Fallback: when `gemini-research.sh` has recently failed, it touches
#     /tmp/claude-gemini-rate-limited. If that marker is fresh (< 30 min),
#     this hook exits 0 to let WebSearch through so research isn't blocked
#     while Gemini is degraded.
#
# Why: tool-routing rules belong in hooks, not prompts — the harness
# enforces them so the rule can't be forgotten. The marker dance gives
# best-of-both-worlds: grounded results when available, WebSearch when not.

MARKER=/tmp/claude-gemini-rate-limited
STALE_MINUTES=30

# Drain stdin (Claude Code pipes hook input here)
cat >/dev/null

# If gemini-research.sh recently failed, allow WebSearch as a fallback.
# `find -mmin -N` prints the path iff modified in the last N minutes.
if [ -n "$(find "$MARKER" -mmin -$STALE_MINUTES 2>/dev/null)" ]; then
  exit 0
fi

jq -n '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: "WebSearch is blocked. Use Bash to run `~/.claude/hooks/gemini-research.sh \"your query\"` for grounded Google Search. If the wrapper fails (rate-limited or offline), retry with WebSearch — this hook will then allow it for 30 minutes. Run from the project CWD if file context matters, and prefer delegating via a subagent to keep research output out of main context."
  }
}'
