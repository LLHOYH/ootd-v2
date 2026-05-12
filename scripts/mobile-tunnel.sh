#!/usr/bin/env bash
# scripts/mobile-tunnel.sh
#
# Cafe-friendly Metro launcher that BYPASSES @expo/ngrok.
#
# Why bypass: @expo/ngrok @ 4.1.3 is the latest on npm and still ships
# the ngrok v2 binary + v2-shaped /api/tunnels payload. The current
# ngrok cloud + agent reject both. We spent three PRs patching it
# (binary swap, config version, payload field strip) and kept hitting
# new walls (cloud-side "tunnel already exists" was the last one).
# Cheaper to skip the wrapper entirely.
#
# Instead, we piggyback on the ngrok agent that `pnpm tunnel` already
# runs for the backend proxy. We add a second tunnel pointing at
# Metro's :8081 via the agent's local /api/tunnels endpoint, read the
# resulting public URL, and start Expo with
# REACT_NATIVE_PACKAGER_HOSTNAME set so the QR + manifest URLs use
# the tunnel host. One ngrok account, one agent, two tunnels.
#
# Prereq: `pnpm tunnel` running in another terminal (the script will
# tell you if not).
#
# Compatible with bash 3.2 (macOS system bash).
#
# Usage: pnpm mobile:tunnel  (which calls this via the package script)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"

NGROK_ADMIN="${NGROK_ADMIN:-http://127.0.0.1:4040}"
METRO_PORT="${METRO_PORT:-8081}"
TUNNEL_NAME="${MEI_METRO_TUNNEL_NAME:-mei-metro}"

# ---- 1. Verify the backend tunnel is running -----------------------------

if ! curl -fsS -m 2 "$NGROK_ADMIN/api/tunnels" >/dev/null 2>&1; then
  cat >&2 <<EOF
[mobile-tunnel] no ngrok agent reachable at $NGROK_ADMIN.

This script piggybacks on the agent that 'pnpm tunnel' starts for the
backend proxy — start that in another terminal first:

    pnpm tunnel

Then re-run 'pnpm mobile:tunnel'.
EOF
  exit 1
fi

# ---- 2. Look up (or create) the Metro tunnel ------------------------------
#
# Idempotent: if a tunnel with our name already exists on the agent,
# reuse its public URL rather than creating a duplicate.

read_url_for() {
  # $1 = tunnel name. Echoes public_url, or empty if not found.
  curl -fsS "$NGROK_ADMIN/api/tunnels" \
    | python3 -c "
import json, sys
data = json.load(sys.stdin)
for t in data.get('tunnels', []):
    if t.get('name') == '$1' and t.get('proto') == 'https':
        print(t.get('public_url', ''))
        break
" 2>/dev/null || true
}

METRO_URL="$(read_url_for "$TUNNEL_NAME")"

if [ -z "$METRO_URL" ]; then
  echo "[mobile-tunnel] creating Metro tunnel ($TUNNEL_NAME → :$METRO_PORT)…"
  RESPONSE="$(
    curl -sS -X POST "$NGROK_ADMIN/api/tunnels" \
      -H "Content-Type: application/json" \
      -d "{\"name\":\"$TUNNEL_NAME\",\"proto\":\"http\",\"addr\":$METRO_PORT}" \
    || true
  )"
  METRO_URL="$(read_url_for "$TUNNEL_NAME")"
  if [ -z "$METRO_URL" ]; then
    echo "[mobile-tunnel] failed to create Metro tunnel. Response from agent:" >&2
    echo "$RESPONSE" >&2
    exit 1
  fi
  echo "[mobile-tunnel] created: $METRO_URL"
else
  echo "[mobile-tunnel] reusing existing tunnel: $METRO_URL"
fi

METRO_HOST="$(printf '%s' "$METRO_URL" | sed -E 's|^https?://||;s|/.*||')"

# ---- 3. Tear-down trap ----------------------------------------------------
#
# When the user Ctrl+Cs Expo we keep the tunnel around (next launch
# reuses it). If you want to drop the tunnel explicitly, run:
#   curl -X DELETE $NGROK_ADMIN/api/tunnels/$TUNNEL_NAME
# (left to the user — silent cleanup on exit makes the next run pay
# the cold-start "create tunnel" cost.)

# ---- 4. Launch Metro with REACT_NATIVE_PACKAGER_HOSTNAME ------------------

cat <<EOF

[mobile-tunnel] Metro will announce itself on:
  $METRO_URL

  Paste that URL into Expo Go > "Enter URL manually" — or scan the QR
  code Expo prints below. Both Expo Go and the dev menu will hit your
  Mac through the same ngrok session 'pnpm tunnel' is using, so the
  backend (\$EXPO_PUBLIC_API_URL) and Metro share one account.

EOF

# EXPO_PACKAGER_PROXY_URL takes priority in UrlCreator and correctly
# resolves the protocol + 443 port for https URLs, which is exactly
# what we want for an ngrok tunnel. REACT_NATIVE_PACKAGER_HOSTNAME is
# set as a defensive fallback for any code path that hasn't migrated
# to the proxy URL env yet.

cd "$MOBILE_DIR"
exec env \
  EXPO_PACKAGER_PROXY_URL="$METRO_URL" \
  REACT_NATIVE_PACKAGER_HOSTNAME="$METRO_HOST" \
  npx expo start --host=lan --port="$METRO_PORT" "$@"
