#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PWD/.env.tools/bun/bin:$PATH"
if ! command -v bun >/dev/null; then
  echo "Bun is required. Restore the pinned runtime described in docs/local-subscriptions.md." >&2
  exit 1
fi
exec bun scripts/doctor.ts "$@"
