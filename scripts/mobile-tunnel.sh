#!/usr/bin/env bash
# scripts/mobile-tunnel.sh
#
# Cafe-friendly Metro launcher.
#
# Tunnel selection — long story. We've been through three approaches:
#
#   1. Expo's built-in `--tunnel` (= @expo/ngrok wrapper). Broken
#      against ngrok 3 in three different ways (v2 binary, v2 yaml,
#      v2 /api/tunnels payload). Patched in #67 and #68, but kept
#      surfacing new walls.
#
#   2. Piggyback on the user's `pnpm tunnel` ngrok agent and add a
#      Metro tunnel via the agent's local API. Worked from a Mac
#      curl, but Expo Go on iOS sends a Safari-ish User-Agent → ngrok's
#      free-tier abuse interstitial page intercepts the bundle fetch
#      and Expo Go gets HTML where it wants JS. Reserved domains have
#      the same warning. No server-side bypass on free tier.
#
#   3. (now) Use Cloudflare's free Quick Tunnel for Metro. No account,
#      no warning page, fresh https://*.trycloudflare.com URL each
#      run. Backend keeps using ngrok via `pnpm tunnel` because the
#      backend uses non-browser User-Agents (supabase-js, our api
#      client) so it doesn't trip the warning.
#
# Prereq: cloudflared installed (brew install cloudflared). Script
# bails with a clear message if not.
#
# Compatible with bash 3.2 (macOS system bash).
#
# Usage: pnpm mobile:tunnel  (which calls this via the package script)

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"

METRO_PORT="${METRO_PORT:-8081}"
CF_LOG="${CF_LOG:-/tmp/mei-mobile-cloudflared.log}"

# ---- 1. cloudflared on PATH? ---------------------------------------------

if ! command -v cloudflared >/dev/null 2>&1; then
  cat >&2 <<EOF
[mobile-tunnel] cloudflared not on PATH.

Install it (one-time) with:

    brew install cloudflared

Then re-run 'pnpm mobile:tunnel'. No account or login required — we use
the free anonymous Quick Tunnel mode.
EOF
  exit 1
fi

# ---- 2. Start cloudflared, wait for its URL line --------------------------

: > "$CF_LOG"
cloudflared tunnel --no-autoupdate --url "http://localhost:$METRO_PORT" \
  > "$CF_LOG" 2>&1 &
CF_PID=$!

# ---- 3. Cleanup trap ------------------------------------------------------
#
# We don't `exec` Expo so we can keep cloudflared as our child and
# clean it up on shutdown. Without this, Ctrl+C would orphan the
# tunnel to PID 1 and we'd accumulate trycloudflare.com URLs over the
# session.

EXPO_PID=""

cleanup() {
  if [ -n "${EXPO_PID:-}" ]; then
    kill -TERM "$EXPO_PID" 2>/dev/null || true
  fi
  if [ -n "${CF_PID:-}" ]; then
    kill -TERM "$CF_PID" 2>/dev/null || true
  fi
}
trap cleanup INT TERM EXIT

# ---- 4. Parse the trycloudflare.com URL from the log ---------------------
#
# cloudflared prints the tunnel URL inside a boxed banner. Pattern is
# stable enough to grep. We wait up to ~20 s; cold start is usually
# under 5 s.

METRO_URL=""
for _ in $(seq 1 40); do
  METRO_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$CF_LOG" 2>/dev/null | head -1)"
  if [ -n "$METRO_URL" ]; then
    break
  fi
  if ! kill -0 "$CF_PID" 2>/dev/null; then
    echo "[mobile-tunnel] cloudflared exited before printing a URL. Log tail:" >&2
    tail -20 "$CF_LOG" >&2
    exit 1
  fi
  sleep 0.5
done

if [ -z "$METRO_URL" ]; then
  echo "[mobile-tunnel] cloudflared didn't print a tunnel URL within 20s. Log tail:" >&2
  tail -20 "$CF_LOG" >&2
  exit 1
fi

METRO_HOST="$(printf '%s' "$METRO_URL" | sed -E 's|^https?://||;s|/.*||')"

cat <<EOF

[mobile-tunnel] Metro tunnel ready:
  $METRO_URL
  (log: $CF_LOG)

  This URL is fresh per run — different from your backend ngrok
  reserved domain. Scan the QR code Expo prints below or paste the URL
  into Expo Go > "Enter URL manually".

EOF

# ---- 5. Launch Metro with the cloudflared URL as the proxy ----------------

cd "$MOBILE_DIR"
env \
  EXPO_PACKAGER_PROXY_URL="$METRO_URL" \
  REACT_NATIVE_PACKAGER_HOSTNAME="$METRO_HOST" \
  npx expo start --host=lan --port="$METRO_PORT" "$@" &
EXPO_PID=$!

wait "$EXPO_PID"
