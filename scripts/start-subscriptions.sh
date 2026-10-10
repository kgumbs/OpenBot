#!/usr/bin/env bash
# Claude is the initial default model. Additional subscription Bots can use
# separate services and credentials without changing this default.
. "$(dirname "$0")/require-bash.sh"
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=docker-compose.yml:docker-compose.subscriptions.yml
export OPENBOT_LOCAL_SUBSCRIPTION=claude
export PICKED_HARNESS_SOURCE=installed
export PICKED_HARNESS_IMAGE=openbot-agent-claude-sdk:local
export PICKED_HARNESS_URL=http://127.0.0.1:4212
export PICKED_HARNESS_NAME="Claude Pro"
export PICKED_HARNESS_KIND=remote-ag-ui
export MANAGED_AGENT_AG_UI_URL=http://127.0.0.1:4212
export CLAUDE_BOT_URL=http://127.0.0.1:4212
export TENANT_PACKAGE_DIR=../examples/local-subscriptions
export AGENT_ENDPOINT_ALLOWED_HOSTS="$(bun -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util"; const e=parseEnv(readFileSync(".env","utf8")); console.log([process.env.AGENT_ENDPOINT_ALLOWED_HOSTS ?? e.AGENT_ENDPOINT_ALLOWED_HOSTS ?? "", "127.0.0.1:4212", "127.0.0.1:4206"].filter(Boolean).join(","))')"
if [[ -s .env.chatgpt/chatgpt-auth.json ]]; then
  export COMPOSE_PROFILES=chatgpt
  export OPENBOT_LOCAL_CHATGPT=true
  export CHATGPT_BOT_URL=http://127.0.0.1:4206
  # The server authenticates its two owned endpoints: the selected default
  # harness (Claude) and the additional managed Bot (ChatGPT).
  export MANAGED_AGENT_AG_UI_URL="$CHATGPT_BOT_URL"
fi
if [[ "${1:-}" == "--stop" ]]; then
  exec bash scripts/stop.sh
fi
if [[ $# -ne 0 ]]; then
  echo "Usage: bash scripts/start-subscriptions.sh [--stop]" >&2
  exit 1
fi
bun -e 'import {readFileSync} from "node:fs"; import {parseEnv} from "node:util";
const e={...parseEnv(readFileSync(".env","utf8")),...process.env};
if(!e.CLAUDE_CODE_OAUTH_TOKEN?.trim()) {console.error("Run claude setup-token yourself, then save CLAUDE_CODE_OAUTH_TOKEN in .env. Do not send the token in chat."); process.exit(1)}
if(e.CHATGPT_AUTH_FILE?.trim()) {console.error("Keep the future ChatGPT Bot credential separate; Claude is the built-in default."); process.exit(1)}'
exec bash scripts/start.sh
