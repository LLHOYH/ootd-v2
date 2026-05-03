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

target_host=""
case "$mode" in
  localhost|local|loopback)
    target_host="127.0.0.1"
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
    ;;
  *)
    echo "unknown target: $mode (try: lan | localhost)" >&2
    exit 1
    ;;
esac

# Swap the three host:port lines. Preserve everything else (Supabase URL,
# anon key, comments, blank lines).
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

while IFS= read -r line; do
  case "$line" in
    EXPO_PUBLIC_API_URL=*)
      printf 'EXPO_PUBLIC_API_URL=http://%s:3001\n' "$target_host"
      ;;
    EXPO_PUBLIC_STYLIST_URL=*)
      printf 'EXPO_PUBLIC_STYLIST_URL=http://%s:8080\n' "$target_host"
      ;;
    EXPO_PUBLIC_IMAGE_WORKER_URL=*)
      printf 'EXPO_PUBLIC_IMAGE_WORKER_URL=http://%s:8090\n' "$target_host"
      ;;
    *)
      printf '%s\n' "$line"
      ;;
  esac
done < "$ENV_FILE" > "$tmp"

mv "$tmp" "$ENV_FILE"
trap - EXIT

echo "[mobile-target] $ENV_FILE updated:"
grep '^EXPO_PUBLIC_\(API\|STYLIST\|IMAGE_WORKER\)_URL=' "$ENV_FILE"
echo
echo "Next:"
echo "  - Restart pnpm mobile:web (or pnpm mobile:start) so Expo rebuilds the bundle."
if [ "$mode" = "localhost" ] || [ "$mode" = "local" ] || [ "$mode" = "loopback" ]; then
  echo "  - Open http://localhost:8081 on this Mac."
else
  echo "  - On your phone (same Wi-Fi as the Mac):"
  echo "      Safari → http://${target_host}:8081"
  echo "      Expo Go → scan the QR code printed by pnpm mobile:start"
fi
