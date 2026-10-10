# Local model assessment

Verified October 10, 2026. The working Claude/ChatGPT configuration is unchanged.

## Workstation findings

- Mac memory: 48 GiB; disk free: approximately 213 GiB.
- Docker allocation: approximately 7.65 GiB, 16 CPUs.
- Ollama 0.34.2 is running on port 11434.
- Installed `qwen3.5:latest`: approximately 6.6 GB, 9.7B parameters, Q4_K_M.
- Its OpenAI-compatible endpoint returned `OK` for a chat request and a structured
  `get_weather` tool call with Boston as the city in a separate request.
- The existing ChatGPT container reached Ollama through
  `http://host.docker.internal:11434` with HTTP 200.

These checks establish basic model compatibility, not full OpenBot tool execution,
conversation persistence, or risk-assessment quality.

## Recommended first implementation

Add an optional `agent-local` Compose service using the existing LangGraph AG-UI
image. Keep its configuration separate from both subscription services:

- `BOT_PROVIDER=openai`
- `BOT_MODEL=qwen3.5:latest`
- `OPENAI_BASE_URL=http://host.docker.internal:11434/v1`
- `OPENAI_API_KEY=ollama` (placeholder for the client, not a paid API credential)
- No `CHATGPT_AUTH_FILE` and no subscription credential mount.
- Separate loopback port, with the same server-to-agent authentication and tool
  callback controls as the existing Bots.

Register it as an additional Bot rather than replacing the default. Verify chat,
actual tool execution, denial rules, and persistence through a restart before
routing general, knowledge, or risk-assessment Bots to it. Keep tool concurrency
and context modest initially; model quality must be assessed separately.

## Remaining Intelligence dependency

A local model removes the model subscription/API billing requirement. It does not
replace CopilotKit Intelligence, which currently holds durable threads and memory.
The current managed project remains configured.

CopilotKit's free Developer plan qualifies for local evaluation. That stack needs
at least 4 CPUs, 12 GiB available Docker RAM, and 40 GiB free storage **after other
containers**. The current Docker allocation cannot meet that check. Increasing
Docker memory requires planning around both the host model and other containers;
12 GiB total is not sufficient if OpenBot is already using some of it.

Local evaluation uses a renewable 30-day license and requires an account and
internet for renewals. It is not a license-free deployment. Its documented feature
set excludes User Memory and Product Analytics, and connecting creates a fresh
local project rather than copying managed conversation history.

Sources checked on the assessment date:

- https://docs.copilotkit.ai/intelligence/self-hosting-local
- https://docs.ollama.com/api/openai-compatibility

The isolated local Bot profile is implemented; see [Local Qwen](local-model.md).
Managed Intelligence and both subscriptions remain configured. Moving Intelligence
is a separate migration.
