#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$PWD/.env.tools/bun/bin:$PATH"
exec bun scripts/rebuild-local.ts "$@"
