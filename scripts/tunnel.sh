#!/usr/bin/env bash
# scripts/tunnel.sh
#
# Permanent-URL tunnel for Mei: boots the proxy on :8000 and starts
# ngrok pointing at it via your reserved static domain.
#
# Pre-reqs (one-time):
#   - pnpm services running in another terminal (api/stylist/etc.)
#   - cp scripts/ngrok.yml.example scripts/ngrok.yml
#   - paste your ngrok authtoken
#   - reserve a free static domain at
#     https://dashboard.ngrok.com/cloud-edge/domains and put it in
#     scripts/ngrok.yml under tunnels.proxy.domain
#
# After running this script once, the mobile env vars stay stable
# forever. Use `pnpm mobile:target:ngrok-static` to patch them.
#
# Compatible with bash 3.2 (macOS system bash) — see scripts/dev.sh
# for the same compatibility notes.

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CFG="$SCRIPT_DIR/ngrok.yml"
PROXY_PORT="${PROXY_PORT:-8000}"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not on PATH. Install: brew install ngrok/ngrok/ngrok" >&2
  exit 1
fi

if [ ! -f "$CFG" ]; then
  echo "missing $CFG — copy scripts/ngrok.yml.example first" >&2
  exit 1
fi

if grep -q 'authtoken: REPLACE_ME' "$CFG"; then
  echo "$CFG still has the placeholder authtoken — paste yours from" >&2
  echo "  https://dashboard.ngrok.com/get-started/your-authtoken" >&2
  exit 1
fi

# Pull the static domain out of the config so we can echo it post-
# launch and verify it isn't the placeholder. Accept both v2
# (`hostname:`) and v3 (`domain:`) syntax — different ngrok 3.x
# agents accept different config schemas.
DOMAIN="$(grep -E '^\s*(hostname|domain):' "$CFG" | head -1 | sed -E 's/.*(hostname|domain):[[:space:]]*//;s/[[:space:]]*$//')"
# Be forgiving about the value — the ngrok dashboard shows the domain
# as a clickable `https://...` URL, so people naturally paste it with
# the scheme. Strip scheme + trailing slash so the post-launch echo
# doesn't print `https://https://...`.
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%/}"
if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "REPLACE_ME.ngrok-free.dev" ]; then
  echo "$CFG has no static domain configured. Reserve one at" >&2
  echo "  https://dashboard.ngrok.com/cloud-edge/domains" >&2
  echo "and set tunnels.proxy.hostname (v2) or tunnels.proxy.domain (v3)." >&2
  exit 1
fi

# Probe the four backend services so the tunnel doesn't go live with
# nothing behind it (the user would see confusing 502s on the phone).
need_running() {
  local label="$1" url="$2"
  if ! curl -fsS -m 2 "$url" >/dev/null 2>&1; then
    echo "[tunnel] $label not reachable at $url" >&2
    echo "[tunnel] start the backend first: pnpm services" >&2
    exit 1
  fi
}
need_running "api"          "http://127.0.0.1:3001/_health"
need_running "stylist"      "http://127.0.0.1:8080/health"
need_running "image-worker" "http://127.0.0.1:8090/health"
need_running "notifier"     "http://127.0.0.1:8082/health"

PROXY_PID=""
NGROK_PID=""

# Walk the process subtree rooted at $1 and echo every descendant pid,
# one per line. We need this because `pkill -P` only walks one level,
# but our proxy chain is `pnpm → tsx → node` (and ngrok may spawn its
# own helpers too). If we only TERM the top of the tree the
# grandchildren get reparented to PID 1 and keep ports 8000/3001/etc.
# busy, which is what made the user hit EADDRINUSE on the next run.
#
# Bash 3.2 compatible — plain recursive function, no associative
# arrays, no `mapfile`.
list_subtree() {
  local pid="$1" kid
  for kid in $(pgrep -P "$pid" 2>/dev/null); do
    echo "$kid"
    list_subtree "$kid"
  done
}

cleanup() {
  echo
  echo "[tunnel] shutting down…"
  # Snapshot the tree BEFORE we send any signals. Once a parent dies
  # its children reparent to PID 1 and `pgrep -P <dead-pid>` returns
  # nothing, so collecting first and killing second is the only way to
  # actually reach the leaves.
  local all_pids=() p
  if [ -n "$NGROK_PID" ]; then
    all_pids+=("$NGROK_PID")
    for p in $(list_subtree "$NGROK_PID"); do all_pids+=("$p"); done
  fi
  if [ -n "$PROXY_PID" ]; then
    all_pids+=("$PROXY_PID")
    for p in $(list_subtree "$PROXY_PID"); do all_pids+=("$p"); done
  fi
  # Polite TERM first so node/tsx can flush logs and release ports.
  for pid in "${all_pids[@]}"; do
    kill -TERM "$pid" 2>/dev/null || true
  done
  # Give them a moment, then KILL anything that didn't take the hint.
  sleep 0.5
  for pid in "${all_pids[@]}"; do
    kill -KILL "$pid" 2>/dev/null || true
  done
  exit 0
}
trap cleanup INT TERM

# Start the proxy.
#
# `exec pnpm …` so the subshell becomes pnpm rather than wrapping it —
# means $PROXY_PID is the actual pnpm wrapper, and `list_subtree` only
# has to descend `pnpm → tsx` instead of `subshell → pnpm → tsx`. Same
# trick scripts/dev.sh uses.
PROXY_LOG="/tmp/mei-proxy.log"
: > "$PROXY_LOG"
(
  cd "$REPO_ROOT"
  PROXY_PORT="$PROXY_PORT" \
    exec pnpm --filter @mei/api exec tsx ../../scripts/proxy.ts
) > "$PROXY_LOG" 2>&1 &
PROXY_PID=$!
echo "[tunnel] proxy pid=$PROXY_PID log=$PROXY_LOG"

# Wait for it to come up.
for _ in $(seq 1 30); do
  if curl -fsS -m 1 "http://127.0.0.1:${PROXY_PORT}/_health" >/dev/null 2>&1; then
    echo "[tunnel] proxy ready on :${PROXY_PORT}"
    break
  fi
  sleep 0.5
done

# Start ngrok.
NGROK_LOG="/tmp/mei-ngrok.log"
: > "$NGROK_LOG"
ngrok start --all --config "$CFG" --log stdout --log-format json > "$NGROK_LOG" 2>&1 &
NGROK_PID=$!
echo "[tunnel] ngrok pid=$NGROK_PID log=$NGROK_LOG"

# Wait for the tunnel to register.
for _ in $(seq 1 30); do
  if curl -fsS -m 2 "http://127.0.0.1:4040/api/tunnels" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

PUBLIC_URL="https://$DOMAIN"
echo
echo "[tunnel] live: $PUBLIC_URL"
echo "[tunnel]   /api/...          → 127.0.0.1:3001"
echo "[tunnel]   /stylist/...      → 127.0.0.1:8080"
echo "[tunnel]   /image-worker/... → 127.0.0.1:8090"
echo "[tunnel]   /notifier/...     → 127.0.0.1:8082"
echo "[tunnel]   /_health          → aggregated"
echo
echo "[tunnel] Patch apps/mobile/.env once with:"
echo "         pnpm mobile:target:ngrok-static"
echo "         (reads the domain from scripts/ngrok.yml automatically)"
echo
echo "[tunnel] Ctrl+C to stop."
echo

wait "$NGROK_PID"
cleanup
