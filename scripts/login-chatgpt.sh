#!/usr/bin/env bash
. "$(dirname "$0")/require-bash.sh"
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .env.chatgpt
chmod 700 .env.chatgpt
echo "Open the sign-in URL printed below in your browser and use your ChatGPT Plus account."
exec docker run --rm -it --pull=never \
  -p 127.0.0.1:1455:1456 \
  -v "$PWD/.env.chatgpt:/auth" \
  -v "$PWD/scripts/login-chatgpt.py:/login.py:ro" \
  openbot-agent-langgraph-agui:local python /login.py
