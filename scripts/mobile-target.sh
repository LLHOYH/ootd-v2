#!/usr/bin/env bash
# scripts/mobile-target.sh
#
# Swap the EXPO_PUBLIC_*_URL values in apps/mobile/.env between
# `localhost` (Mac-only testing) and `lan` (phone in Safari / Expo Go).
#
# Why this matters:
#   `EXPO_PUBLIC_*` env vars are inlined into the JS bundle at build
#   time. When your phone loads the bundle from your Mac and the
#   bundle calls `127.0.0.1`, that resolves to the *phone's* loopback
#   — nothing's there, every API call fails. Swap to your Mac's LAN
#   IP and the phone reaches the right machine.
#
# Usage:
#   scripts/mobile-target.sh lan          # phone-friendly (auto-detects Mac IP)
#   scripts/mobile-target.sh lan 192.168.x.y   # explicit IP
#   scripts/mobile-target.sh localhost    # back to 127.0.0.1
#   scripts/mobile-target.sh ngrok-static # uses your reserved ngrok
#                                         # domain from scripts/ngrok.yml
#                                         # — set once, never re-patch
#                                         # the env between sessions
#
# The Supabase URL stays untouched — it's hosted, reachable from
# anywhere already.
#
# After running this you MUST restart `pnpm mobile:web` (or
# `pnpm mobile:start`) so Expo re-reads the env and rebuilds the
# bundle.

set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$REPO_ROOT/apps/mobile/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "missing $ENV_FILE — copy apps/mobile/.env.example first" >&2
  exit 1
fi

mode="${1:-}"
override_ip="${2:-}"

if [ -z "$mode" ]; then
  echo "usage: $0 lan [<ip>] | localhost" >&2
  exit 1
fi

# Two URL formats:
#   - host:port    (lan, localhost) — full URL is http://<host>:<port>
#   - prefixed     (ngrok-static)  — full URL is https://<domain>/<svc>
#
# Each EXPO_PUBLIC_*_URL line is built from these.
api_url=""
stylist_url=""
worker_url=""
mode_label="$mode"

case "$mode" in
  localhost|local|loopback)
    api_url="http://127.0.0.1:3001"
    stylist_url="http://127.0.0.1:8080"
    worker_url="http://127.0.0.1:8090"
    mode_label="localhost"
    ;;
  lan|wifi|phone)
    if [ -n "$override_ip" ]; then
      target_host="$override_ip"
    else
      target_host="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
      if [ -z "$target_host" ]; then
        echo "couldn't auto-detect LAN IP. Pass it explicitly:" >&2
        echo "  $0 lan 192.168.1.42" >&2
        echo "(check ifconfig | grep 'inet ' for candidates)" >&2
        exit 1
      fi
    fi
    api_url="http://${target_host}:3001"
    stylist_url="http://${target_host}:8080"
    worker_url="http://${target_host}:8090"
    mode_label="lan ($target_host)"
    ;;
  ngrok-static|static|ngrok)
    cfg="$SCRIPT_DIR/ngrok.yml"
    if [ ! -f "$cfg" ]; then
      echo "scripts/ngrok.yml is missing. Copy from ngrok.yml.example first." >&2
      exit 1
    fi
    # Accept both v2 (`hostname:`) and v3 (`domain:`) syntax so users
    # who set up either config flavour can use the same script.
    domain="$(grep -E '^\s*(hostname|domain):' "$cfg" | head -1 | sed -E 's/.*(hostname|domain):[[:space:]]*//;s/[[:space:]]*$//')"
    # Be forgiving about the value — the ngrok dashboard shows the
    # domain as a clickable `https://...` URL, so people naturally
    # paste it with the scheme. Strip scheme + trailing slash so we
    # don't end up composing URLs like `https://https://...`.
    domain="${domain#http://}"
    domain="${domain#https://}"
    domain="${domain%/}"
    if [ -z "$domain" ] || [ "$domain" = "REPLACE_ME.ngrok-free.dev" ]; then
      echo "scripts/ngrok.yml has no static domain configured." >&2
      echo "Reserve one at https://dashboard.ngrok.com/cloud-edge/domains" >&2
      echo "and set tunnels.proxy.hostname (v2) or tunnels.proxy.domain (v3)" >&2
      echo "in scripts/ngrok.yml." >&2
      exit 1
    fi
    api_url="https://${domain}/api"
    stylist_url="https://${domain}/stylist"
    worker_url="https://${domain}/image-worker"
    mode_label="ngrok-static (${domain})"
    ;;
  *)
    echo "unknown target: $mode (try: lan | localhost | ngrok-static)" >&2
    exit 1
    ;;
esac

# Swap the three URL lines in place. Preserve everything else (Supabase
# URL, anon key, comments, blank lines).
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

while IFS= read -r line; do
  case "$line" in
    EXPO_PUBLIC_API_URL=*)
      printf 'EXPO_PUBLIC_API_URL=%s\n' "$api_url"
      ;;
    EXPO_PUBLIC_STYLIST_URL=*)
      printf 'EXPO_PUBLIC_STYLIST_URL=%s\n' "$stylist_url"
      ;;
    EXPO_PUBLIC_IMAGE_WORKER_URL=*)
      printf 'EXPO_PUBLIC_IMAGE_WORKER_URL=%s\n' "$worker_url"
      ;;
    *)
      printf '%s\n' "$line"
      ;;
  esac
done < "$ENV_FILE" > "$tmp"

mv "$tmp" "$ENV_FILE"
trap - EXIT

echo "[mobile-target] $ENV_FILE updated for: $mode_label"
grep '^EXPO_PUBLIC_\(API\|STYLIST\|IMAGE_WORKER\)_URL=' "$ENV_FILE"
echo
echo "Next:"
echo "  - Restart pnpm mobile:web (or pnpm mobile:start) so Expo rebuilds the bundle."
case "$mode" in
  localhost|local|loopback)
    echo "  - Open http://localhost:8081 on this Mac."
    ;;
  lan|wifi|phone)
    echo "  - On your phone (same Wi-Fi as the Mac):"
    echo "      Safari → http://${target_host}:8081"
    echo "      Expo Go → scan the QR code printed by pnpm mobile:start"
    ;;
  ngrok-static|static|ngrok)
    echo "  - Make sure pnpm tunnel is running (proxy + ngrok)."
    echo "  - On your phone, anywhere with internet:"
    echo "      Safari → ${api_url%/api}/  (or wherever Expo serves)"
    echo "  - Static domain — env stays valid across restarts."
    ;;
esac
