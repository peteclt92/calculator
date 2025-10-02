# AGENTS.md — Oct 1, 2025 (Sandboxed VM / Codex)

## Golden rules
Operate through **Git only**. Never request or store cloud tokens. Do not change **Codex/MCP** settings or host-level configuration; act strictly inside the project workspace. Do not run **vercel login** or **vercel deploy**. Pushing to Git creates previews; merging **main** deploys production. If a capability depends on prior host auth (for example **gh pr create**), use it only when auth already exists; otherwise report branch, SHA, and checks and stop.

## Repository shape
Keep **source** under `src/` and **tests** under `tests/` with mirrored structure. Put prompts, fixtures, and sample payloads under `assets/`. Store design notes and ADRs under `docs/`. Keep modules cohesive; refactor at roughly 400 LOC.

## Tooling and versions
Pin **Python** and **Node** versions. Use `pyproject.toml` with `requires-python=">=3.11,<3.12"` (or your target) and add `.python-version` for local shims. Use `.nvmrc` with a concrete Node LTS (e.g., `20.11.1`) and `engines` in `package.json`. Agents do not install system packages. If a CLI like **ripgrep** or **fd** is required and not present, vendor a static binary under `tools/` and amend `PATH` locally; do **not** use `sudo`, `apt`, or `brew`.

## Build and development
Create a venv using `python -m venv .venv && . .venv/bin/activate`, then `pip install -r requirements.txt`. Keep `requirements.txt` current and deterministic. When a `web/` app exists, run `npm ci --prefix web`, `npm run lint --prefix web`, and `npm run build --prefix web`. Provide `make` shims such as `make lint`, `make test`, `make build`, and `make dev`, but treat them as thin wrappers around the canonical commands.

## Testing
Execute `pytest -q`. Prefer behavior-focused names and explicit assertions. Consolidate fixtures in `tests/conftest.py` and document complex ones inline. When a Node app exists, expose `npm test` and keep it green. Make tests idempotent and free of network calls unless explicitly mocked.

## Lint and style
Run **ruff** for Python and **ESLint/Prettier** for JS/TS. Put ruff and ESLint config in `pyproject.toml` and the repo root respectively. Scope exceptions narrowly and justify them with comments. Use **ripgrep** and **fd** for repository searches. Allow **grep** only in POSIX test pipelines where portability matters.

## Git flow and reporting
Fetch and rebase **main** before branching, then branch from the updated base. Do not force-push unless explicitly requested. After pushing, report **branch**, **SHA** (short), and a terse **change summary**, plus the **local check status**. Use `gh pr create` only if the environment is already authenticated; never prompt for tokens.

```sh
git fetch origin
git switch main || git checkout -B main
git pull --rebase origin main || true
git switch -c feature/<topic>

python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
ruff check src tests
pytest -q

if [ -d web ]; then
  npm ci --prefix web
  npm run lint --prefix web
  npm run build --prefix web
  npm test --prefix web
fi

git add -A
git commit -m "<type>: <summary>"
git push -u origin HEAD

echo "BRANCH: $(git rev-parse --abbrev-ref HEAD)"
echo "SHA: $(git rev-parse --short HEAD)"
```

## CI policy
Require CI on push and PR. Block merges to **main** on failing checks. Run ruff and pytest for Python and lint, test, and build for web when present. Keep CI deterministic and network-minimized.

```yaml
# .github/workflows/ci.yml
name: ci
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt
      - run: . .venv/bin/activate && ruff check src tests
      - run: . .venv/bin/activate && pytest -q
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: if [ -d web ]; then npm ci --prefix web; fi
      - run: if [ -d web ]; then npm run lint --prefix web; fi
      - run: if [ -d web ]; then npm test --prefix web; fi
      - run: if [ -d web ]; then npm run build --prefix web; fi
```

## Deployments (Vercel)
Treat **main** as production. Do not use the Vercel CLI for auth or deploy. Do not guess preview URLs. After push, provide branch and SHA only. A maintainer posts preview links. On merge to **main**, production builds automatically. See **Vercel CLI (optional, guarded)** for one-time linking under explicit user request.

## Local server behavior
Build the project if required (`npm run build`, `npx next build`, `vite build`, or equivalent). Start a local server, perform a health check, and report the local URL.

**Fixed port policy.** Bind **strictly** to `127.0.0.1:3000`. Do **not** auto-increment or choose an alternative port. If `:3000` is unavailable, fail with a concise JSON error and remediation commands (see below).

For static HTML/CSS/JS, default to **Python http.server**. Use **serve** only when already present in `node_modules` or declared and installed as a devDependency.

**Automatic Local Server Launch.** After completing any coding task, start the local server automatically and confirm health before reporting. Emit a single status line in JSON: `server_url`, `host`, `port`, `pid`, `health`.

**Port conflict & remediation (mandatory).** If the server cannot bind to `3000`, emit:
```
{"error":"port_in_use","host":"127.0.0.1","port":3000,"commands":["lsof -i :3000","kill -9 <pid>","./static-serve.sh"]}
```
If binding succeeds but health never returns HTTP 2xx/3xx within the timeout, emit:
```
{"error":"health_timeout","host":"127.0.0.1","port":3000,"log":"logs/local-server.out"}
```
No additional prose. Never leak env values or secrets.

```sh
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
```

```sh
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
```

## Lifecycle contract
Expose a **start command**, a **health URL** that returns 200 when ready, and a **test command** that exits cleanly. Put defaults in a single file to avoid guessing. Increase the first-run health timeout to accommodate cold starts.

```sh
# .env.contract
START_CMD="python -m uvicorn app.main:app --port 3000"
HEALTH_URL="http://127.0.0.1:3000/healthz"
TEST_CMD="curl -fsS $HEALTH_URL | grep 'ok'"
HEALTH_TIMEOUT=60
```

## Ephemeral serve-and-test
Use the script for CI-style checks and short-lived verification. Persistent servers are separate.

```sh
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
```

## Vercel CLI (optional, guarded)
**Allowed ops:** `vercel link` and `vercel env pull` only.  
**Trigger:** explicit user request (e.g., “link this repo to Vercel”).  
**Preconditions:** `vercel --version` and `vercel whoami` must succeed non-interactively. If not authenticated, abort and report; do **not** run `vercel login`.  
**Scope:** run in the repo root; only create `.vercel/project.json`. Do not mutate global config.  
**Secrets:** pull envs to `.env.local`; never echo values; ensure `.env*` is gitignored.  
**Deploys:** remain Git-driven. Do **not** run `vercel deploy`. Do not guess preview URLs.

```sh
#!/usr/bin/env sh
# Managed-By: Codex AGENTS.md v2025-10-01
# vercel-link.sh — safe, non-interactive
set -eu
PROJECT_SLUG=${1:?usage: vercel-link.sh <project-slug>}

command -v vercel >/dev/null 2>&1 || { echo "vercel-cli-missing"; exit 2; }
vercel whoami >/dev/null 2>&1 || { echo "vercel-cli-unauthenticated"; exit 3; }

vercel link --yes --project "$PROJECT_SLUG" >/dev/null

grep -qE '^\.env(\..*)?$' .gitignore 2>/dev/null || echo ".env*" >> .gitignore
vercel env pull .env.local --yes >/dev/null

echo "{"linked":true,"project":"$PROJECT_SLUG","env_file":".env.local"}"
```

## Script provisioning (autonomous)
If `static-serve.sh`, `stop-local-server.sh`, `serve-and-test.sh`, or `vercel-link.sh` are missing, Codex **must create** them at repo root from the canonical blocks in this file, mark them executable, and commit them. Add the header `# Managed-By: Codex AGENTS.md v2025-10-01` to each generated file. If a file exists **without** that header, do **not** overwrite it; write a side-by-side `<name>.codex` variant and report. If a file exists **with** the header but differs, replace it with the canonical content and commit. Never write outside the workspace.

**Git bootstrap.** If `.git` is absent when provisioning scripts or scaffolding, Codex must run:
```
git init
git add AGENTS.md *.sh
git commit -m "chore: bootstrap managed scripts"
```
All subsequent generated files for the first working revision must be committed with a Conventional Commit message.
