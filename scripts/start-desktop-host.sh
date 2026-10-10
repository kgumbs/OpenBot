#!/usr/bin/env bash
. "$(dirname "$0")/require-bash.sh"
set -euo pipefail
cd "$(dirname "$0")/.."
desktop_binary="$PWD/desktop/src-tauri/target/debug/openbot-desktop"
if [[ ! -x "$desktop_binary" ]]; then
  echo "Build the desktop app first: cd desktop && bun run tauri build --debug --no-bundle" >&2
  exit 1
fi
# Memory only: this credential is never written to .env or sent to Bot containers.
export OPENBOT_DESKTOP_HOST_TOKEN="$(openssl rand -hex 32)"
export OPENBOT_CLONE_ROOT="$PWD"
export OPENBOT_CLONE_HOST_URL=http://127.0.0.1:3001
export OPENBOT_CLONE_APP_URL=http://127.0.0.1:3010/admin/computers
bash scripts/start-subscriptions.sh
"$desktop_binary" &
desktop_pid=$!
# Verify broker attachment and service health before leaving the launcher waiting.
if bun scripts/startup-health.ts wait; then
  echo "OpenBot is ready."
else
  health_status=$?
  if [[ "$health_status" -eq 2 ]]; then
    echo "OpenBot started with degraded readiness; review the diagnostics above."
  else
    echo "OpenBot started but readiness failed. Services remain available for diagnosis." >&2
    exit "$health_status"
  fi
fi
wait "$desktop_pid"
