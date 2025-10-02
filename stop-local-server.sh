#!/usr/bin/env sh
# Managed-By: Codex AGENTS.md v2025-10-01
# stop-local-server.sh
set -eu
PID_FILE=${PID_FILE:-.server.pid}
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  kill "$PID" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "stopped:$PID"
else
  echo "no-server"
fi
