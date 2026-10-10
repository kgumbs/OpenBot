#!/bin/bash
# Start this clone with Claude Pro, ChatGPT Plus, and native folder approvals.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PWD/.env.tools/bun/bin:$PATH"

usage() {
  echo "Usage: bash start-openbot.command [--check | --restart]"
  echo "No arguments: start Docker, subscription Bots, and the native folder broker."
  echo "--restart: restart this clone, preserving database and browser volumes."
  echo "--check: verify local prerequisites without starting or stopping services."
}
if [[ "${1:-}" == "--help" ]]; then usage; exit 0; fi
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != "--check" && "$1" != "--restart" ) ]]; then usage >&2; exit 1; fi
for executable in bun docker curl openssl; do
  command -v "$executable" >/dev/null || { echo "Missing prerequisite: $executable" >&2; exit 1; }
done
if [[ "$(bun --version)" != "1.3.14" ]]; then
  echo "This clone requires Bun 1.3.14. Restore .env.tools/bun/bin/bun." >&2
  exit 1
fi
for required in .env scripts/start-subscriptions.sh scripts/start-desktop-host.sh; do
  [[ -f "$required" ]] || { echo "Missing required file: $required" >&2; exit 1; }
done
[[ -x desktop/src-tauri/target/debug/openbot-desktop ]] || {
  echo "Build the desktop app first; see docs/local-subscriptions.md." >&2; exit 1;
}
if [[ "${1:-}" == "--check" ]]; then
  echo "Prerequisites ready: $PWD (Bun 1.3.14, desktop executable, saved configuration)."
  echo "This check does not validate credentials or service health."
  exit 0
fi

# Full process ownership and Doctor readiness replace a connected flag alone.
state="$(bun scripts/startup-health.ts desktop-state)"
if [[ "${1:-}" == "--restart" ]]; then
  bun scripts/startup-health.ts stop-desktop
  bash scripts/start-subscriptions.sh --stop --keep-computers
elif [[ "$state" == "reuse" ]]; then
  exec bash doctor-openbot.command
elif [[ "$state" == "repair-services" ]]; then
  echo "Desktop is attached, but services need attention. Use --restart for a full reattachment."
  exec bash doctor-openbot.command
elif [[ "$state" == "disconnected" ]]; then
  echo "Quit this clone's disconnected desktop app, or use --restart to reattach it." >&2
  exit 1
fi

echo "Starting Docker Desktop (up to 90 seconds)..."
docker desktop start --timeout 90
if ! docker info >/dev/null 2>&1; then
  echo "Docker is unavailable. Check Docker Desktop, then retry." >&2
  exit 1
fi
echo "Starting OpenBot with configured subscriptions and native folder access..."
echo "Keep this Terminal and the desktop app open. Approve folders per Bot in Admin > Computers."
exec bash scripts/start-desktop-host.sh
