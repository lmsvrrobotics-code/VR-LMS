#!/usr/bin/env bash
# Run all four backend processes in one container.
#
# bash, not sh: `wait -n` (exit as soon as any child dies) is a bash builtin and
# is not available in POSIX sh / Alpine's ash. The Nixpacks Node image is
# Debian-based so bash is present.
#
# Only Bastion binds the platform-injected PORT — it is the sole public entry
# point and proxies to the others over localhost. The three internal services
# bind fixed ports that match the defaults in Bastion's serviceMap
# (src/utils/serviceMap.js), so no *_SERVICE_URL needs to be set:
#
#   auth        -> localhost:8001   (AUTH_SERVICE_PORT)
#   admin       -> localhost:5000   (ADMIN_SERVICE_PORT)
#   assessment  -> localhost:8003   (ASSESSMENT_SERVICE_PORT)
#   bastion     -> $PORT            (public)
#
# If any process exits, kill the rest and exit non-zero. Without this the
# container would stay "healthy" with a dead backend behind a live gateway,
# turning a crash into silent 502s instead of a restart.

set -euo pipefail

cd "$(dirname "$0")"

pids=""

cleanup() {
  # Killing an already-dead pid is fine; suppress the noise.
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
}
trap cleanup EXIT INT TERM

start() {
  name="$1"
  dir="$2"
  shift 2
  echo "[start-all] starting $name"
  # Prefix each line so four interleaved logs stay readable in Railway.
  #
  # `set -o pipefail` inside the subshell is load-bearing: without it the
  # subshell reports sed's exit status (always 0), so a crashed service would
  # look like a clean exit and `wait -n` below would never trigger a restart.
  ( set -o pipefail; cd "$dir" && "$@" 2>&1 | sed "s/^/[$name] /" ) &
  pids="$pids $!"
}

AUTH_SERVICE_PORT="${AUTH_SERVICE_PORT:-8001}" \
  start auth auth-service node --import ./instrument.mjs index.js

ADMIN_SERVICE_PORT="${ADMIN_SERVICE_PORT:-5000}" \
  start admin admin-service node src/server.js

ASSESSMENT_SERVICE_PORT="${ASSESSMENT_SERVICE_PORT:-8003}" \
  start assessment assessment-service node index.js

# Bastion last: it is the public listener, so the container is only reachable
# once the services it proxies to have had a moment to come up.
start bastion Bastion-server node --import ./instrument.mjs index.js

# Exit as soon as ANY child exits, with that child's status.
wait -n
status=$?
echo "[start-all] a service exited (status $status) — shutting down container"
exit "$status"
