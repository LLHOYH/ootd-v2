#!/usr/bin/env bash
# scripts/ngrok-tunnel.sh
#
# Open ngrok tunnels for the four backend services and patch
# apps/mobile/.env with the resulting public URLs so the phone can
# reach them from anywhere — cellular, hotel Wi-Fi, sharing with a
# remote tester.
#
# Why ngrok vs LAN: see docs/TESTING.md → "Phone access strategies".
# TL;DR — LAN swap is free and faster on home Wi-Fi; ngrok is the
# right call when the phone isn't on the same network as the Mac.
#
# Usage:
#   pnpm services            # in another terminal — backend must be live first
#   scripts/ngrok-tunnel.sh  # opens tunnels + patches .env + waits
#
# Ctrl+C closes the tunnels and reverts apps/mobile/.env to the
# previous state.

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/mobile/.env"
CFG="$SCRIPT_DIR/ngrok.yml"
BACKUP="$ENV_FILE.pre-ngrok.bak"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok not on PATH. Install: brew install ngrok/ngrok/ngrok" >&2
  exit 1
fi

if [ ! -f "$CFG" ]; then
  echo "missing $CFG — copy scripts/ngrok.yml.example to scripts/ngrok.yml" >&2
  echo "and paste your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken" >&2
  exit 1
fi

if grep -q 'REPLACE_ME' "$CFG"; then
  echo "$CFG still has the placeholder authtoken (REPLACE_ME) — paste yours first" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE — copy apps/mobile/.env.example first" >&2
  exit 1
fi

# Probe that the four backend services are actually up. ngrok happily
# tunnels into nothing if they aren't, and the phone gets confusing
# 502s.
need_running() {
  local label="$1" url="$2"
  if ! curl -fsS -m 2 "$url" >/dev/null 2>&1; then
    echo "[ngrok] $label is not responding at $url" >&2
    echo "[ngrok] start the backend first: pnpm services" >&2
    exit 1
  fi
}
need_running "api"          "http://127.0.0.1:3001/_health"
need_running "stylist"      "http://127.0.0.1:8080/health"
need_running "image-worker" "http://127.0.0.1:8090/health"
need_running "notifier"     "http://127.0.0.1:8082/health"

cp "$ENV_FILE" "$BACKUP"
echo "[ngrok] backed up apps/mobile/.env → $BACKUP"

cleanup() {
  echo
  echo "[ngrok] shutting down…"
  if [ -n "${NGROK_PID:-}" ]; then
    kill "$NGROK_PID" 2>/dev/null || true
    pkill -P "$NGROK_PID" 2>/dev/null || true
  fi
  if [ -f "$BACKUP" ]; then
    mv "$BACKUP" "$ENV_FILE"
    echo "[ngrok] reverted apps/mobile/.env"
  fi
  exit 0
}
trap cleanup INT TERM

# Start ngrok with all tunnels in the background.
LOG_FILE="/tmp/mei-ngrok.log"
: > "$LOG_FILE"
ngrok start --all --config "$CFG" --log stdout --log-format json > "$LOG_FILE" 2>&1 &
NGROK_PID=$!
echo "[ngrok] started pid=$NGROK_PID, querying API for tunnel URLs…"

# Poll the local ngrok admin API for the public URLs.
api_url=""
stylist_url=""
worker_url=""
notifier_url=""
for _ in $(seq 1 30); do
  raw="$(curl -fsS -m 2 http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)"
  if [ -n "$raw" ]; then
    api_url="$(printf '%s' "$raw" | sed -n 's/.*"name":"api"[^}]*"public_url":"\([^"]*\)".*/\1/p' | head -1)"
    stylist_url="$(printf '%s' "$raw" | sed -n 's/.*"name":"stylist"[^}]*"public_url":"\([^"]*\)".*/\1/p' | head -1)"
    worker_url="$(printf '%s' "$raw" | sed -n 's/.*"name":"image-worker"[^}]*"public_url":"\([^"]*\)".*/\1/p' | head -1)"
    notifier_url="$(printf '%s' "$raw" | sed -n 's/.*"name":"notifier"[^}]*"public_url":"\([^"]*\)".*/\1/p' | head -1)"
    if [ -n "$api_url" ] && [ -n "$stylist_url" ] && [ -n "$worker_url" ] && [ -n "$notifier_url" ]; then
      break
    fi
  fi
  sleep 1
done

if [ -z "$api_url" ]; then
  echo "[ngrok] couldn't find tunnel URLs after 30s. Check $LOG_FILE." >&2
  echo "[ngrok] last ngrok output:" >&2
  tail -20 "$LOG_FILE" >&2
  cleanup
fi

echo
echo "[ngrok] tunnels live:"
printf '  api          %s\n' "$api_url"
printf '  stylist      %s\n' "$stylist_url"
printf '  image-worker %s\n' "$worker_url"
printf '  notifier     %s\n' "$notifier_url"

# Patch the .env in place.
tmp="$(mktemp)"
while IFS= read -r line; do
  case "$line" in
    EXPO_PUBLIC_API_URL=*)          printf 'EXPO_PUBLIC_API_URL=%s\n' "$api_url" ;;
    EXPO_PUBLIC_STYLIST_URL=*)      printf 'EXPO_PUBLIC_STYLIST_URL=%s\n' "$stylist_url" ;;
    EXPO_PUBLIC_IMAGE_WORKER_URL=*) printf 'EXPO_PUBLIC_IMAGE_WORKER_URL=%s\n' "$worker_url" ;;
    *)                              printf '%s\n' "$line" ;;
  esac
done < "$ENV_FILE" > "$tmp"
mv "$tmp" "$ENV_FILE"

echo
echo "[ngrok] apps/mobile/.env patched with public URLs."
echo "[ngrok] Restart Expo so it rebuilds the bundle: pnpm mobile:web"
echo "[ngrok] Then on your phone, open the URL Expo prints."
echo
echo "[ngrok] tailing tunnel events (Ctrl+C to stop + revert .env)…"
echo

# Block until the user Ctrl+Cs.
wait "$NGROK_PID"
cleanup
