#!/bin/sh
# Run all four backend processes in one container.
#
# POSIX sh, NOT bash: the Nixpacks runtime image has no bash executable, so a
# `#!/usr/bin/env bash` shebang fails at container creation with
# "The executable `bash` could not be found". That also rules out `wait -n`
# (a bash builtin) — the fifo below is the portable equivalent.
#
# Only Bastion binds the platform-injected PORT — it is the sole public entry
# point and proxies to the others over localhost. The three internal services
# bind fixed ports matching the defaults in Bastion's serviceMap
# (src/utils/serviceMap.js), so no *_SERVICE_URL needs to be set:
#
#   auth        -> localhost:8001   (AUTH_SERVICE_PORT)
#   admin       -> localhost:5000   (ADMIN_SERVICE_PORT)
#   assessment  -> localhost:8003   (ASSESSMENT_SERVICE_PORT)
#   bastion     -> $PORT            (public)
#
# If any process exits, the whole container exits non-zero so Railway restarts
# it. Without that a crashed backend would sit behind a live gateway serving
# 502s while the platform still believed the deploy was healthy.
#
# Note: no `set -e`. An ERR exit inside the supervisor subshells would abort
# them before the real child status is recorded, turning every crash into a
# generic status 1.
set -u

cd "$(dirname "$0")"

rundir=$(mktemp -d)
fifo="$rundir/exits"
mkfifo "$fifo"

pids=""

cleanup() {
  # Killing an already-dead pid is fine; suppress the noise.
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
  rm -rf "$rundir"
}
trap cleanup EXIT INT TERM

start() {
  name="$1"
  dir="$2"
  shift 2
  echo "[start-all] starting $name"
  (
    cd "$dir" || exit 1
    # Output is piped through sed to prefix the service name so four
    # interleaved log streams stay readable in Railway. The command's own exit
    # status is written to a file INSIDE the pipeline, because the pipeline's
    # status is sed's (always 0) and POSIX sh has no `pipefail` — without this
    # a crashed service reads as a clean exit and never triggers a restart.
    # `sed -u` (unbuffered) is required: with stdout a pipe rather than a tty,
    # sed block-buffers at 4KB. Each service prints only a few hundred bytes at
    # startup and then goes quiet, so those lines sat in the buffer and never
    # reached Railway — the container looked silent, and only services that
    # CRASHED ever logged (exiting flushes the buffer). That hid exactly the
    # "running on <port>" lines needed to diagnose the port collision above.
    { "$@" 2>&1; echo $? > "$rundir/rc.$name"; } | sed -u "s/^/[$name] /"
    # sed has exited by this point, so rc.$name is fully written.
    echo "$name $(cat "$rundir/rc.$name" 2>/dev/null || echo 1)" > "$fifo"
  ) &
  pids="$pids $!"
}

# These MUST be exported, not passed as a `VAR=x start ...` prefix. The prefix
# form sets the variable only for the `start` shell function's own environment;
# the service actually runs as `"$@"` inside a subshell within that function, so
# node never inherited it. Every service then fell through to `process.env.PORT`
# — the single public port Railway injects — and whichever bound it first (admin,
# since Bastion starts last) became the public listener, leaving the gateway
# unreachable and /api/v1/* answering with admin-service's 401.
export AUTH_SERVICE_PORT="${AUTH_SERVICE_PORT:-8001}"
export ADMIN_SERVICE_PORT="${ADMIN_SERVICE_PORT:-5000}"
export ASSESSMENT_SERVICE_PORT="${ASSESSMENT_SERVICE_PORT:-8003}"

start auth auth-service node --import ./instrument.mjs index.js

start admin admin-service node src/server.js

start assessment assessment-service node index.js

# Bastion last: it is the public listener, so the container only becomes
# reachable once the services it proxies to have had a moment to come up.
start bastion Bastion-server node --import ./instrument.mjs index.js

# Blocks until the FIRST service writes its exit status.
read -r failed_service failed_status < "$fifo"
echo "[start-all] '$failed_service' exited (status $failed_status) — shutting down container"
exit "$failed_status"
