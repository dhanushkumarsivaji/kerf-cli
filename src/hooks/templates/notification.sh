#!/bin/bash
# kerf-cli notification hook — logs token usage to ~/.kerf/session-log.jsonl
# Receives JSON on stdin with session_id and transcript_path

KERF_LOG="${HOME}/.kerf/session-log.jsonl"
mkdir -p "$(dirname "$KERF_LOG")"

# Read stdin
INPUT=$(cat)

# Validate JSON before embedding to prevent log corruption
if ! echo "$INPUT" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
  if ! echo "$INPUT" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null; then
    exit 0
  fi
fi

# Extract fields
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"//')

# Append to log
echo "{\"timestamp\":\"${TIMESTAMP}\",\"session_id\":\"${SESSION_ID}\",\"event\":\"notification\",\"raw\":${INPUT}}" >> "$KERF_LOG"
