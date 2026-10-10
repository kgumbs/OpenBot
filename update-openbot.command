#!/bin/bash
# Explicit source update with a private database/configuration recovery bundle.
set -euo pipefail
cd -P "$(dirname "$0")"
export PATH="$PWD/.env.tools/bun/bin:$PATH"
umask 077
usage() { echo 'Usage: bash update-openbot.command --check [ref] | --apply ref | --rollback bundle'; }
mode="${1:---check}"
ref="${2:-upstream/main}"
case "$mode" in --check|--apply|--rollback) ;; *) usage >&2; exit 1;; esac
[[ $# -le 2 ]] || { usage >&2; exit 1; }
if [[ "$mode" == --check ]]; then
  git rev-parse --verify "$ref^{commit}" >/dev/null
  git log --oneline "HEAD..$ref"
  echo 'Check uses locally fetched refs. Fetch upstream separately to check newer updates.'
  exit 0
fi
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit or stash changes before updating or rolling back.' >&2; exit 1; }
if [[ "$mode" == --rollback ]]; then
  bundle="$(cd -P "$ref" && pwd)"
  [[ "$bundle" == "$PWD/.env.tools/backups/"* ]] || { echo 'Use a recovery bundle from this clone.' >&2; exit 1; }
  [[ "$(git rev-parse HEAD)" == "$(cat "$bundle/after")" ]] || { echo 'New commits exist. Review a targeted revert instead of automatic rollback.' >&2; exit 1; }
  git revert --no-edit -m 1 "$(cat "$bundle/after")"
  echo "Source reverted. Database and configuration are retained; recovery files: $bundle"
  echo 'Run focused checks and bash start-openbot.command --restart. Restore data only if migration recovery requires it; see docs/local-recovery.md.'
  exit 0
fi
[[ $# -eq 2 ]] || { usage >&2; exit 1; }
git rev-parse --verify "$ref^{commit}" >/dev/null
if git merge-base --is-ancestor "$ref" HEAD; then echo 'That revision is already included.'; exit 0; fi
bundle="$PWD/.env.tools/backups/update-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$bundle"
git rev-parse HEAD > "$bundle/before"
git rev-parse "$ref^{commit}" > "$bundle/target"
cp .env "$bundle/config.env"
# This command reads the database; it does not stop services or alter browser volumes.
docker compose -f docker-compose.yml exec -T postgres pg_dump -U openbot -d openbot -Fc > "$bundle/database.dump"
[[ -s "$bundle/database.dump" ]] || { echo "Empty backup; update cancelled. $bundle" >&2; exit 1; }
docker compose -f docker-compose.yml exec -T postgres pg_restore --list < "$bundle/database.dump" > /dev/null
if ! git merge --no-ff --no-edit "$(cat "$bundle/target")"; then
  git merge --abort
  echo "Merge conflicted and was aborted. Recovery bundle: $bundle" >&2
  exit 1
fi
git rev-parse HEAD > "$bundle/after"
echo "Source updated. Recovery bundle: $bundle"
echo 'No service restart was requested. Run focused checks, then bash start-openbot.command --restart and bash doctor-openbot.command.'
