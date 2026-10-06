#!/usr/bin/env bash
# Sandbox helper: start wrangler dev detached, wait until ready, run a command, stop the server.
cd "$(dirname "$0")/.."
setsid npx wrangler dev --port 8787 > /tmp/wrangler.log 2>&1 &
SERVER=$!
for i in $(seq 1 40); do curl -s -m 2 -o /dev/null http://localhost:8787/api/equipment && break; sleep 1; done
"$@"; rc=$?
kill -- -"$SERVER" 2>/dev/null
exit $rc
