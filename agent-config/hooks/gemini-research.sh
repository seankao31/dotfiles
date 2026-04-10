#!/bin/bash
# Wrapper around `gemini -p` that records failures so the WebSearch hook
# can fall back to raw WebSearch when Gemini is unavailable.
#
# Success  → remove marker (WebSearch blocking stays active)
# Failure  → touch marker + emit retry guidance on stderr (block-websearch.sh
#            sees a fresh marker and allows the next WebSearch through)

MARKER=/tmp/claude-gemini-rate-limited

gemini -p "$@"
status=$?

if [ $status -eq 0 ]; then
  rm -f "$MARKER"
  exit 0
fi

touch "$MARKER"
printf 'gemini-research failed (exit %d — likely rate-limited or offline). Retry by calling WebSearch directly: the WebSearch hook will allow it for the next 30 minutes.\n' "$status" >&2
exit $status
