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
wait "$desktop_pid"
