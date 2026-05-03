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
# to /tmp/mei-<service>.log and a multiplexed tail prints to the
# screen so you can watch all four at once. Ctrl+C kills everything
# cleanly.
#
# Compatible with bash 3.2 (the macOS system bash) — no associative
# arrays, no `wait -n`. Tested on /bin/bash 3.2.57 and /opt/homebrew/bin/bash 5.x.
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

# ---------------------------------------------------------------------------
# Service registry — pipe-delimited so we can split per-field with `cut`
# without depending on bash 4 associative arrays.
#
#   name | pnpm-filter | env_path | port | pnpm-script | health-path
# ---------------------------------------------------------------------------
SERVICES=(
  "api|@mei/api|services/api/.env|3001|serve|/_health"
  "stylist|@mei/stylist|services/stylist/.env|8080|start|/health"
  "image-worker|@mei/image-worker|services/image-worker/.env|8090|start|/health"
  "notifier|@mei/notifier|services/notifier/.env|8082|start|/health"
)

# Pick selection: all by default, or the named ones from $@.
SELECTED=()
if [ $# -eq 0 ]; then
  for entry in "${SERVICES[@]}"; do
    SELECTED+=("$(printf '%s' "$entry" | cut -d'|' -f1)")
  done
else
  SELECTED=("$@")
fi

# ---------------------------------------------------------------------------
# Colour codes — case statement instead of an associative array so this
# works on bash 3.2.
# ---------------------------------------------------------------------------
colour_for() {
  case "$1" in
    api)          printf '\033[36m' ;;  # cyan
    stylist)      printf '\033[35m' ;;  # magenta
    image-worker) printf '\033[33m' ;;  # yellow
    notifier)     printf '\033[32m' ;;  # green
    *)            printf '\033[37m' ;;  # white
  esac
}
RESET='\033[0m'

# Look up a service entry by name. Echoes the pipe-delimited line, or empty.
service_entry() {
  local want="$1"
  local entry name
  for entry in "${SERVICES[@]}"; do
    name="$(printf '%s' "$entry" | cut -d'|' -f1)"
    if [ "$name" = "$want" ]; then
      printf '%s' "$entry"
      return 0
    fi
  done
  return 1
}

# ---------------------------------------------------------------------------
# State + cleanup.
# ---------------------------------------------------------------------------
PIDS=()

cleanup() {
  printf '\n\n[dev.sh] shutting down…\n'
  # The recorded PIDS are the pnpm wrappers. Kill them, then sweep up
  # the whole subtree (tsx node processes are grandchildren and would
  # otherwise reparent to PID 1, leaving orphan listeners holding ports
  # 3001/8080/8090/8082 — which is what made the user accumulate 18+
  # zombie dev.sh runs before this fix).
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
    # Kill children-of-pid recursively (pnpm → tsx → node).
    pkill -TERM -P "$pid" 2>/dev/null || true
  done
  # Kill any tail processes we backgrounded.
  pkill -P $$ 2>/dev/null || true
  # Final sweep: anything in our process group that's still around.
  sleep 0.5
  for pid in "${PIDS[@]}"; do
    pkill -KILL -P "$pid" 2>/dev/null || true
    kill -KILL "$pid" 2>/dev/null || true
  done
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
  local name="$1" filter="$2" env_path="$3" script="$4"
  local log_file="/tmp/mei-${name}.log"
  : > "$log_file"

  # Subshell so env vars don't leak into the parent shell.
  (
    set -a
    # shellcheck disable=SC1090
    source "$env_path"
    set +a
    exec pnpm --filter "$filter" "$script"
  ) > "$log_file" 2>&1 &

  local pid=$!
  PIDS+=("$pid")
  printf '[dev.sh] started %-12s pid=%s log=%s\n' "$name" "$pid" "$log_file"
}

# ---------------------------------------------------------------------------
# Boot the selected services.
# ---------------------------------------------------------------------------
for name in "${SELECTED[@]}"; do
  entry="$(service_entry "$name")"
  if [ -z "$entry" ]; then
    printf '[dev.sh] unknown service: %s (try: api stylist image-worker notifier)\n' "$name" >&2
    continue
  fi
  filter="$(printf '%s' "$entry" | cut -d'|' -f2)"
  env_path="$(printf '%s' "$entry" | cut -d'|' -f3)"
  script="$(printf '%s' "$entry" | cut -d'|' -f5)"
  if check_env "$env_path" "$name"; then
    start_service "$name" "$filter" "$env_path" "$script"
  fi
done

if [ "${#PIDS[@]}" -eq 0 ]; then
  echo '[dev.sh] no services started — fix the .env errors above.' >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Health probe — wait up to 20s for each service to answer its
# /health (or /_health) endpoint, then announce ready.
# ---------------------------------------------------------------------------
sleep 2
for name in "${SELECTED[@]}"; do
  entry="$(service_entry "$name")"
  [ -z "$entry" ] && continue
  port="$(printf '%s' "$entry" | cut -d'|' -f4)"
  health_path="$(printf '%s' "$entry" | cut -d'|' -f6)"
  url="http://127.0.0.1:${port}${health_path}"
  for _ in $(seq 1 40); do
    if curl -fsS -m 1 "$url" >/dev/null 2>&1; then
      printf '[dev.sh] %-12s ready %s\n' "$name" "$url"
      break
    fi
    sleep 0.5
  done
done

printf '\n[dev.sh] all services up. tailing logs (Ctrl+C to stop)…\n\n'

# ---------------------------------------------------------------------------
# Multiplexed tail with coloured prefixes.
# ---------------------------------------------------------------------------
prefix_tail() {
  local name="$1" log_file="$2"
  local colour
  colour="$(colour_for "$name")"
  tail -n 0 -F "$log_file" 2>/dev/null | while IFS= read -r line; do
    printf '%b[%s]%b %s\n' "$colour" "$name" "$RESET" "$line"
  done
}

for name in "${SELECTED[@]}"; do
  log_file="/tmp/mei-${name}.log"
  if [ -f "$log_file" ]; then
    prefix_tail "$name" "$log_file" &
  fi
done

# ---------------------------------------------------------------------------
# Block until the user Ctrl+Cs.
#
# `wait -n` (block until any one job exits) is bash 4.3+, but macOS
# ships bash 3.2. Plain `wait` blocks until ALL backgrounded jobs are
# done; combined with our INT/TERM trap it gives the right behaviour
# (Ctrl+C kills everything cleanly). The downside is that if a single
# service crashes we don't notice automatically — but the prefixed
# log tail surfaces the crash anyway, and the operator can Ctrl+C
# and restart.
# ---------------------------------------------------------------------------
wait
cleanup
