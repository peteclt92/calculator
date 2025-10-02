#!/usr/bin/env sh
# Managed-By: Codex AGENTS.md v2025-10-01
# serve-and-test.sh
set -eu
: "${START_CMD:?missing START_CMD}"
: "${HEALTH_URL:?missing HEALTH_URL}"
: "${TEST_CMD:?missing TEST_CMD}"

HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-60}"
HEALTH_INTERVAL="${HEALTH_INTERVAL:-0.5}"

sh -c "$START_CMD" &
SRV_PID=$!

cleanup(){ kill "$SRV_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

elapsed=0
until curl -fsS "$HEALTH_URL" >/dev/null 2>&1; do
  sleep "$HEALTH_INTERVAL"
  elapsed=$(awk "BEGIN{print $elapsed+$HEALTH_INTERVAL}")
  if [ "$(printf '%.0f' "$elapsed")" -ge "$HEALTH_TIMEOUT" ]; then
    echo "Health check timeout: $HEALTH_URL" >&2
    exit 1
  fi
done

set +e
sh -c "$TEST_CMD"
TEST_STATUS=$?
set -e

kill "$SRV_PID" 2>/dev/null || true
wait "$SRV_PID" 2>/dev/null || true
exit "$TEST_STATUS"
