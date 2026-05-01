#!/usr/bin/env bash
# scripts/dev.sh
#
# One-stop local-dev launcher for the four backend services Mei needs:
#
#   api          (port 3001) — sync HTTP CRUD; the main Lambda surface
#   stylist      (port 8080) — Stella SSE streaming (Anthropic)
#   image-worker (port 8090) — closet photo promotion pipeline
#   notifier     (port 8082) — Expo Push fan-out (optional)
#
# Each service has its own `.env`; this script sources them in
# subshells so vars don't bleed into your terminal afterwards. Logs go
# to /tmp/<service>.log and a multiplexed tail prints to the screen
# so you can watch all four at once. Ctrl+C kills everything cleanly.
#
# Usage:
#   scripts/dev.sh                # all four services
#   scripts/dev.sh api stylist    # just those two
#
# After the services are up, in another terminal:
#   pnpm mobile:web               # Expo for web
#   pnpm mobile:start             # Expo Go on phone
#
# Prereqs (one-time):
#   - cp services/api/.env.example          services/api/.env          (and fill in)
#   - cp services/stylist/.env.example      services/stylist/.env
#   - cp services/image-worker/.env.example services/image-worker/.env
#   - cp services/notifier/.env.example     services/notifier/.env
#   - cp apps/mobile/.env.example           apps/mobile/.env

set -o pipefail

# Resolve repo root from the script location so it works regardless of cwd.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# Service registry: name | filter | env_path | port
SERVICES=(
  "api|@mei/api|services/api/.env|3001|serve"
  "stylist|@mei/stylist|services/stylist/.env|8080|start"
  "image-worker|@mei/image-worker|services/image-worker/.env|8090|start"
  "notifier|@mei/notifier|services/notifier/.env|8082|start"
)

# Pick selection: all by default, or the named ones from $@.
SELECTED=()
if [ $# -eq 0 ]; then
  for entry in "${SERVICES[@]}"; do
    name="${entry%%|*}"
    SELECTED+=("$name")
  done
else
  SELECTED=("$@")
fi

# Colour codes for log prefixes (matches the order most logs render).
declare -A COLOURS=(
  [api]='\033[36m'          # cyan
  [stylist]='\033[35m'      # magenta
  [image-worker]='\033[33m' # yellow
  [notifier]='\033[32m'     # green
)
RESET='\033[0m'

PIDS=()
LOG_FILES=()

cleanup() {
  printf '\n\n[dev.sh] shutting down…\n'
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  # Best-effort: also kill any tail children that might be hanging.
  pkill -P $$ 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

check_env() {
  local env_path="$1"
  local service="$2"
  if [ ! -f "$env_path" ]; then
    printf '[dev.sh] missing %s — copy %s.example and fill in (skipping %s)\n' \
      "$env_path" "$env_path" "$service" >&2
    return 1
  fi
  if ! grep -q '^SUPABASE_URL=' "$env_path" 2>/dev/null; then
    printf '[dev.sh] %s has no SUPABASE_URL set (skipping %s)\n' "$env_path" "$service" >&2
    return 1
  fi
  return 0
}

start_service() {
  local name="$1" filter="$2" env_path="$3" port="$4" script="$5"
  local log_file="/tmp/mei-${name}.log"
  : > "$log_file"

  # Subshell so env vars don't leak.
  (
    set -a
    # shellcheck disable=SC1090
    source "$env_path"
    set +a
    exec pnpm --filter "$filter" "$script"
  ) > "$log_file" 2>&1 &

  local pid=$!
  PIDS+=("$pid")
  LOG_FILES+=("$log_file")
  printf '[dev.sh] started %-12s pid=%s log=%s\n' "$name" "$pid" "$log_file"
}

# Boot the selected services.
for name in "${SELECTED[@]}"; do
  match=""
  for entry in "${SERVICES[@]}"; do
    if [ "${entry%%|*}" = "$name" ]; then
      match="$entry"
      break
    fi
  done
  if [ -z "$match" ]; then
    printf '[dev.sh] unknown service: %s (try: api stylist image-worker notifier)\n' "$name" >&2
    continue
  fi
  IFS='|' read -r n filter env_path port script <<< "$match"
  if check_env "$env_path" "$n"; then
    start_service "$n" "$filter" "$env_path" "$port" "$script"
  fi
done

if [ "${#PIDS[@]}" -eq 0 ]; then
  echo '[dev.sh] no services started — fix the .env errors above.' >&2
  exit 1
fi

# Health probe loop — wait up to 20s for each service to answer
# /_health (api) or /health (others), then announce ready.
sleep 2
declare -A HEALTH=(
  [api]="http://127.0.0.1:3001/_health"
  [stylist]="http://127.0.0.1:8080/health"
  [image-worker]="http://127.0.0.1:8090/health"
  [notifier]="http://127.0.0.1:8082/health"
)
for name in "${SELECTED[@]}"; do
  url="${HEALTH[$name]:-}"
  if [ -z "$url" ]; then continue; fi
  for _ in $(seq 1 40); do
    if curl -fsS -m 1 "$url" >/dev/null 2>&1; then
      printf '[dev.sh] %-12s ready %s\n' "$name" "$url"
      break
    fi
    sleep 0.5
  done
done

printf '\n[dev.sh] all services up. tailing logs (Ctrl+C to stop)…\n\n'

# Multiplexed tail with coloured prefixes.
prefix_tail() {
  local name="$1" log_file="$2" colour="${COLOURS[$1]:-\033[37m}"
  tail -n 0 -F "$log_file" 2>/dev/null | while IFS= read -r line; do
    printf '%b[%s]%b %s\n' "$colour" "$name" "$RESET" "$line"
  done
}

for i in "${!SELECTED[@]}"; do
  name="${SELECTED[$i]}"
  log_file="/tmp/mei-${name}.log"
  if [ -f "$log_file" ]; then
    prefix_tail "$name" "$log_file" &
  fi
done

# Wait until any service exits or the user Ctrl-Cs.
wait -n "${PIDS[@]}" 2>/dev/null
cleanup
