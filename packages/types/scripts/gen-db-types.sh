#!/usr/bin/env bash
#
# gen-db-types.sh — regenerate packages/types/src/db.ts from the local
# Supabase stack. See packages/types/README.md for the three layers in
# @mei/types and how this fits.
#
# Usage:
#   pnpm --filter @mei/types gen:db
#
# Prereqs:
#   - supabase CLI installed (https://supabase.com/docs/guides/cli)
#   - local stack running: `supabase start` from the repo root.

set -euo pipefail

# Resolve the @mei/types package root from this script's location so the
# script works regardless of the caller's cwd (pnpm --filter, CI, etc.).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_FILE="$PKG_DIR/src/db.ts"

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: supabase CLI not found on PATH." >&2
  echo "       install it first: https://supabase.com/docs/guides/cli/getting-started" >&2
  echo "       (macOS: \`brew install supabase/tap/supabase\`)" >&2
  exit 1
fi

if ! supabase status >/dev/null 2>&1; then
  echo "error: local Supabase stack is not running." >&2
  echo "       start it from the repo root: \`supabase start\`" >&2
  exit 1
fi

HEADER='// AUTO-GENERATED — do not edit. Regenerate with: pnpm --filter @mei/types gen:db'

TMP_FILE="$(mktemp)"
trap 'rm -f "$TMP_FILE"' EXIT

# Generate into a temp file first so a failure mid-run doesn't leave a
# truncated db.ts in the tree.
supabase gen types typescript \
  --local \
  --schema public \
  --schema storage \
  > "$TMP_FILE"

{
  echo "$HEADER"
  echo ""
  cat "$TMP_FILE"
} > "$OUT_FILE"

echo "wrote $OUT_FILE"
