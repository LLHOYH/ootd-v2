#!/usr/bin/env bash
#
# check-db-types.sh — fail if the committed packages/types/src/db.ts does
# not match what `supabase gen types` would produce against the current
# migrations. Wired into CI on PRs as the `db-types-drift` job.
#
# Usage:
#   pnpm --filter @mei/types check:db

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
COMMITTED_FILE="$PKG_DIR/src/db.ts"

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found on PATH." >&2
  echo "       install it first: https://supabase.com/docs/guides/cli/getting-started" >&2
  exit 1
fi

if ! supabase status >/dev/null 2>&1; then
  echo "error: local Supabase stack is not running." >&2
  echo "       start it from the repo root: \`supabase start\`" >&2
  exit 1
fi

if [ ! -f "$COMMITTED_FILE" ]; then
  echo "error: $COMMITTED_FILE is missing." >&2
  echo "       run \`pnpm --filter @mei/types gen:db\` and commit the result." >&2
  exit 1
fi

HEADER='// AUTO-GENERATED — do not edit. Regenerate with: pnpm --filter @mei/types gen:db'

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
TMP_RAW="$TMP_DIR/raw.ts"
TMP_OUT="$TMP_DIR/db.ts"

supabase gen types typescript \
  --local \
  --schema public \
  --schema storage \
  > "$TMP_RAW"

{
  echo "$HEADER"
  echo ""
  cat "$TMP_RAW"
} > "$TMP_OUT"

if diff -u "$COMMITTED_FILE" "$TMP_OUT"; then
  echo "ok: db.ts is in sync with migrations."
  exit 0
fi

cat >&2 <<'MSG'

DB types drift detected. Run `pnpm --filter @mei/types gen:db` and commit.
MSG
exit 1
