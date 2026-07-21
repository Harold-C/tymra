#!/bin/sh
set -eu

rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1440x900x24 -nolisten tcp -ac >/tmp/xvfb.log 2>&1 &
xvfb_pid=$!

attempt=0
while [ ! -S /tmp/.X11-unix/X99 ]; do
  if ! kill -0 "$xvfb_pid" 2>/dev/null; then
    cat /tmp/xvfb.log >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 100 ]; then
    echo "Xvfb did not become ready" >&2
    exit 1
  fi
  sleep 0.1
done

exec npx @ulixee/cloud start
