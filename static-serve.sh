#!/usr/bin/env sh
# Managed-By: Codex AGENTS.md v2025-10-01
# static-serve.sh (fixed :3000, non-blocking, retrying probe, clear remediation)
set -eu

STATIC_DIR=${STATIC_DIR:-web/dist}
[ -d "$STATIC_DIR" ] || STATIC_DIR=web/build
[ -d "$STATIC_DIR" ] || STATIC_DIR=web
[ -d "$STATIC_DIR" ] || STATIC_DIR=.

HOST=127.0.0.1
PORT=3000
LOG_DIR=${LOG_DIR:-logs}
PID_FILE=${PID_FILE:-.server.pid}
HEALTH_TIMEOUT=${HEALTH_TIMEOUT:-10}     # seconds
HEALTH_INTERVAL=${HEALTH_INTERVAL:-0.2}  # seconds

mkdir -p "$LOG_DIR"

probe_ready() {
  max_iter=$(awk -v t="$HEALTH_TIMEOUT" -v i="$HEALTH_INTERVAL" 'BEGIN{printf "%d", (t/i)+0.5}')
  i=0
  while [ "$i" -lt "$max_iter" ]; do
    code=$(curl -s -o /dev/null -w "%{http_code}" "http://$HOST:$PORT/") || code=000
    case "$code" in 200|204|301|302|304) return 0 ;; esac
    sleep "$HEALTH_INTERVAL"
    i=$((i+1))
  done
  return 1
}

err_port_in_use() {
  printf '{"error":"port_in_use","host":"%s","port":%s,"commands":["lsof -i :%s","kill -9 <pid>","./static-serve.sh"]}
' "$HOST" "$PORT" "$PORT"
  exit 1
}
err_health_timeout() {
  printf '{"error":"health_timeout","host":"%s","port":%s,"log":"%s/local-server.out"}
' "$HOST" "$PORT" "$LOG_DIR"
  exit 1
}

start_python() {
  nohup python3 -m http.server "$PORT" --bind "$HOST" --directory "$STATIC_DIR"     >"$LOG_DIR/local-server.out" 2>&1 & echo $! >"$PID_FILE" || return 2
  sleep 0.2
  if grep -qE "Address already in use|Errno 98|EADDRINUSE" "$LOG_DIR/local-server.out" 2>/dev/null; then
    [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
    return 2
  fi
  if probe_ready; then
    echo "http://$HOST:$PORT"
    return 0
  fi
  [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  return 3
}

start_node() {
  if [ ! -x node_modules/.bin/serve ]; then return 4; fi
  nohup node_modules/.bin/serve -s "$STATIC_DIR" -l "$HOST:$PORT"     >"$LOG_DIR/local-server.out" 2>&1 & echo $! >"$PID_FILE" || return 2
  sleep 0.2
  if grep -qE "address already in use|EADDRINUSE" "$LOG_DIR/local-server.out" 2>/dev/null; then
    [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
    return 2
  fi
  if probe_ready; then
    echo "http://$HOST:$PORT"
    return 0
  fi
  [ -f "$PID_FILE" ] && kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  return 3
}

URL=$(start_python || true)
rc=$?
if [ "$rc" -eq 0 ]; then
  PID=$(cat "$PID_FILE")
  printf '{"server_url":"%s","host":"%s","port":%s,"pid":%s,"health":"ok"}
' "$URL" "$HOST" "$PORT" "$PID"
  exit 0
elif [ "$rc" -eq 2 ]; then
  err_port_in_use
elif [ "$rc" -eq 3 ]; then
  err_health_timeout
fi

URL=$(start_node || true)
rc=$?
if [ "$rc" -eq 0 ]; then
  PID=$(cat "$PID_FILE")
  printf '{"server_url":"%s","host":"%s","port":%s,"pid":%s,"health":"ok"}
' "$URL" "$HOST" "$PORT" "$PID"
  exit 0
elif [ "$rc" -eq 2 ]; then
  err_port_in_use
elif [ "$rc" -eq 3 ]; then
  err_health_timeout
fi

printf '{"error":"startup_failed","host":"%s","port":%s,"log":"%s/local-server.out"}
' "$HOST" "$PORT" "$LOG_DIR"
exit 1
