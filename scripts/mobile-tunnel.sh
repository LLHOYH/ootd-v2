#!/usr/bin/env bash
# scripts/mobile-tunnel.sh
#
# Cafe-friendly Expo bundler launcher. Same end result as
# `expo start --tunnel`, but with a self-healing patch in front of it:
#
# @expo/ngrok ships an `@expo/ngrok-bin` that pins ngrok 2.3.41 — the
# old v2 protocol that ngrok's cloud now closes immediately ("session
# closed, starting reconnect loop"). The fix is to substitute a v3
# binary for the bundled v2 one. The system ngrok 3.x install (e.g.
# `brew install ngrok`) is fine — Expo's wrapper invokes it with args
# that v3 still accepts. ngrok 3 also requires `version: "2"` in the
# config it reads at ~/.expo/ngrok.yml; we add that if missing.
#
# Idempotent: detects the prior swap on subsequent runs and skips
# straight to `expo start --tunnel`. Reversible: the bundled v2 binary
# is preserved as `<bin>.v2.bak` next to the symlink — if you ever
# want to roll back, restore it.
#
# Compatible with bash 3.2 (macOS system bash).
#
# Usage: pnpm mobile:tunnel  (which calls this via the package script)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MOBILE_DIR="$REPO_ROOT/apps/mobile"
EXPO_CFG="$HOME/.expo/ngrok.yml"

# ---- 1. Locate @expo/ngrok-bin's resolved binary path ---------------------
#
# The bundled ngrok is one of:
#   $(npm root -g)/@expo/ngrok/node_modules/@expo/ngrok-bin-<plat>-<arch>/ngrok
#   $REPO_ROOT/node_modules/@expo/ngrok-bin-<plat>-<arch>/ngrok
# Easiest path: ask Node to resolve `@expo/ngrok-bin` for us — its
# index.js exports the binary path. Try the local workspace first
# (cwd-anchored require), then fall back to the global install.

BUNDLED_BIN=""
for cwd in "$MOBILE_DIR" "$REPO_ROOT" "$(npm root -g 2>/dev/null)/@expo/ngrok"; do
  if [ -d "$cwd" ]; then
    if BUNDLED_BIN=$(cd "$cwd" 2>/dev/null && node -e "console.log(require('@expo/ngrok-bin'))" 2>/dev/null); then
      if [ -n "$BUNDLED_BIN" ] && [ -e "$BUNDLED_BIN" ]; then
        break
      fi
    fi
    BUNDLED_BIN=""
  fi
done

if [ -z "$BUNDLED_BIN" ]; then
  echo "[mobile-tunnel] could not locate @expo/ngrok-bin. Try:" >&2
  echo "    npm install -g @expo/ngrok" >&2
  exit 1
fi

# ---- 2. If bundled ngrok is v2, swap in the system v3 binary --------------

bundled_major() {
  # `ngrok version` prints e.g. "ngrok version 2.3.41" or "ngrok version 3.39.1"
  "$1" version 2>&1 | head -1 | sed -E 's/.*ngrok version ([0-9]+).*/\1/'
}

CURRENT_MAJOR=$(bundled_major "$BUNDLED_BIN" || echo "?")
case "$CURRENT_MAJOR" in
  3)
    : # already v3 (either previously swapped or upstream finally updated)
    ;;
  2)
    SYSTEM_NGROK="$(command -v ngrok || true)"
    if [ -z "$SYSTEM_NGROK" ]; then
      echo "[mobile-tunnel] Expo's bundled ngrok is v$CURRENT_MAJOR (deprecated)." >&2
      echo "[mobile-tunnel] The current ngrok cloud closes v2 sessions immediately." >&2
      echo "[mobile-tunnel] Install a v3 binary:" >&2
      echo "    brew install ngrok/ngrok/ngrok" >&2
      exit 1
    fi
    SYSMAJOR=$(bundled_major "$SYSTEM_NGROK" || echo "?")
    if [ "$SYSMAJOR" != "3" ]; then
      echo "[mobile-tunnel] system ngrok at $SYSTEM_NGROK is v$SYSMAJOR; need v3." >&2
      echo "[mobile-tunnel] upgrade with: brew upgrade ngrok" >&2
      exit 1
    fi
    echo "[mobile-tunnel] swapping Expo's bundled ngrok v$CURRENT_MAJOR for system ngrok v$SYSMAJOR ($SYSTEM_NGROK)…"
    if [ ! -e "$BUNDLED_BIN.v2.bak" ]; then
      mv "$BUNDLED_BIN" "$BUNDLED_BIN.v2.bak"
    else
      rm -f "$BUNDLED_BIN"
    fi
    ln -s "$SYSTEM_NGROK" "$BUNDLED_BIN"
    ;;
  *)
    echo "[mobile-tunnel] could not parse ngrok version from $BUNDLED_BIN — leaving alone." >&2
    ;;
esac

# ---- 3. ngrok 3 requires `version: "2"` at the top of its YAML ------------

if [ -f "$EXPO_CFG" ] && ! grep -qE '^[[:space:]]*version[[:space:]]*:' "$EXPO_CFG"; then
  echo "[mobile-tunnel] adding 'version: \"2\"' to $EXPO_CFG (ngrok 3 requires it)…"
  TMP=$(mktemp)
  printf 'version: "2"\n' > "$TMP"
  cat "$EXPO_CFG" >> "$TMP"
  mv "$TMP" "$EXPO_CFG"
  chmod 600 "$EXPO_CFG"
fi

# ---- 4. Hand off to Expo --------------------------------------------------

cd "$MOBILE_DIR"
exec npx expo start --tunnel "$@"
