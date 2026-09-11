#!/usr/bin/env bash
#
# Smoke check: boot the production build and prove every route is alive.
#
# This is the only gate that runs the application. Typecheck, lint, build and
# Vitest all pass happily while the deployed app is dead.
#
# It proves the app boots and the routes are wired. Nothing more. A route can
# return 200 and still render a blank page from a hydration error.
#
# Requires an existing build: `pnpm build` is its own gate, and rebuilding here
# would double every phase.

set -uo pipefail

PORT="${SMOKE_PORT:-3100}"   # not 3000, so a stray dev server never collides
HOST="127.0.0.1"             # localhost only, never 0.0.0.0
READY_TIMEOUT=30

# route:expected-status. Protected routes must NOT return 200 to an anonymous
# request - that would mean the guard is missing. Accept only a redirect.
ROUTES=(
  "/:200"
  "/signup:200"
  "/login:200"
  "/unlock:307,302"
  "/vault:307,302"
)

if [ ! -d ".next" ]; then
  echo "FAIL: no .next directory. Run 'pnpm build' first." >&2
  exit 1
fi

SERVER_PID=""
cleanup() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "starting production server on ${HOST}:${PORT}"
pnpm exec next start --hostname "$HOST" --port "$PORT" >/tmp/passio-smoke.log 2>&1 &
SERVER_PID=$!

# Poll for readiness rather than sleeping a fixed interval.
ready=0
for _ in $(seq 1 "$READY_TIMEOUT"); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "FAIL: server exited during startup. Last output:" >&2
    tail -20 /tmp/passio-smoke.log >&2
    exit 1
  fi
  if curl -s -o /dev/null "http://${HOST}:${PORT}/" 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done

if [ "$ready" -ne 1 ]; then
  echo "FAIL: server did not accept connections within ${READY_TIMEOUT}s. Last output:" >&2
  tail -20 /tmp/passio-smoke.log >&2
  exit 1
fi

failed=0
printf '\n%-28s %-14s %s\n' "ROUTE" "EXPECTED" "ACTUAL"
printf '%.0s-' {1..56}; printf '\n'

for entry in "${ROUTES[@]}"; do
  route="${entry%:*}"
  expected="${entry##*:}"
  actual=$(curl -o /dev/null -s -w '%{http_code}' "http://${HOST}:${PORT}${route}")

  if [[ ",${expected}," == *",${actual},"* ]]; then
    printf '%-28s %-14s %s  ok\n' "$route" "$expected" "$actual"
  else
    printf '%-28s %-14s %s  FAIL\n' "$route" "$expected" "$actual"
    failed=1
  fi
done

printf '\n'
if [ "$failed" -ne 0 ]; then
  echo "smoke check FAILED"
  exit 1
fi

echo "smoke check passed: ${#ROUTES[@]} routes alive"
