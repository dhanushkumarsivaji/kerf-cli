#!/bin/bash
# kerf notification hook — logs token usage to ~/.kerf/session-log.jsonl
# Receives JSON on stdin with session_id and transcript_path

KERF_LOG="${HOME}/.kerf/session-log.jsonl"
mkdir -p "$(dirname "$KERF_LOG")"

# Read stdin
INPUT=$(cat)

# Extract fields
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID=$(echo "$INPUT" | grep -o '"session_id"[[:space:]]*:[[:space:]]*"[^"]*"' | head -1 | sed 's/.*: *"//;s/"//')

# Append to log
echo "{\"timestamp\":\"${TIMESTAMP}\",\"session_id\":\"${SESSION_ID}\",\"event\":\"notification\",\"raw\":${INPUT}}" >> "$KERF_LOG"
