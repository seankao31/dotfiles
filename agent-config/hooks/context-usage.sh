#!/bin/bash
# Returns context window usage for the current Claude Code session.
#
# Identifies the session via $PPID -> ~/.claude/sessions/{PID}.json -> JSONL.
# Concurrent-session safe: each Claude Code process has a unique PID.
#
# Usage: bash ~/.claude/hooks/context-usage.sh

set -euo pipefail

SESSIONS_DIR="$HOME/.claude/sessions"
PROJECTS_DIR="$HOME/.claude/projects"
MAX_CONTEXT=1000000

# Walk up the process tree to find the Claude Code process.
# The Bash tool may spawn intermediate shells, so $PPID isn't necessarily claude.
SESSION_JSON=""
pid=$$
while [ "$pid" -gt 1 ]; do
  pid=$(ps -p "$pid" -o ppid= 2>/dev/null | tr -d ' ') || break
  if [ -f "$SESSIONS_DIR/$pid.json" ]; then
    SESSION_JSON="$SESSIONS_DIR/$pid.json"
    break
  fi
done

if [ -z "$SESSION_JSON" ]; then
  echo '{"error": "No Claude Code session found in process ancestors"}'
  exit 1
fi

SESSION_ID=$(python3 -c "import json,sys; print(json.load(open(sys.argv[1]))['sessionId'])" "$SESSION_JSON" 2>/dev/null)
if [ -z "$SESSION_ID" ]; then
  echo '{"error": "Could not read sessionId from '"$SESSION_JSON"'"}'
  exit 1
fi

# Find the session JSONL across all project directories
SESSION_JSONL=$(find "$PROJECTS_DIR" -name "${SESSION_ID}.jsonl" 2>/dev/null | head -1)
if [ -z "$SESSION_JSONL" ] || [ ! -f "$SESSION_JSONL" ]; then
  echo '{"error": "No JSONL found for session '"$SESSION_ID"'"}'
  exit 1
fi

# Parse the last usage entry from the JSONL
python3 -c "
import json, os, sys

path = sys.argv[1]
max_context = int(sys.argv[2])

last_usage = None

with open(path, encoding='utf-8', errors='ignore') as f:
    # Seek near end for large files — 512KB covers plenty of recent entries
    size = os.path.getsize(path)
    if size > 512000:
        f.seek(size - 512000)
        f.readline()  # discard partial line
    for line in f:
        try:
            obj = json.loads(line)
            if 'message' in obj and isinstance(obj['message'], dict):
                usage = obj['message'].get('usage')
                if usage:
                    last_usage = usage
        except (json.JSONDecodeError, KeyError):
            pass

if not last_usage:
    print(json.dumps({'error': 'No usage data found in session JSONL'}))
    sys.exit(1)

inp = last_usage.get('input_tokens', 0)
cache_create = last_usage.get('cache_creation_input_tokens', 0)
cache_read = last_usage.get('cache_read_input_tokens', 0)
output = last_usage.get('output_tokens', 0)
total = inp + cache_create + cache_read
pct = round(total * 100 / max_context, 1) if max_context > 0 else 0

print(json.dumps({
    'context_tokens': total,
    'max_tokens': max_context,
    'percent_used': pct,
    'breakdown': {
        'input_tokens': inp,
        'cache_creation_tokens': cache_create,
        'cache_read_tokens': cache_read,
    },
    'output_tokens': output,
}))
" "$SESSION_JSONL" "$MAX_CONTEXT"
