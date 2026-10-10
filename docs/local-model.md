# Local Qwen Bot

The optional local-model service runs alongside Claude Pro and ChatGPT Plus.
It uses the installed Ollama `qwen3.5:latest` model, with no subscription credential
or OAuth mount. Managed Intelligence still provides conversation storage.

## Start and stop

Start Ollama with its normal application/service workflow. Its API must be reachable
from Docker at `http://host.docker.internal:11434`. The model must already be installed.

In the clone's ignored `.env`, set:

```dotenv
OPENBOT_LOCAL_MODEL=true
LOCAL_BOT_MODEL=qwen3.5:latest
```

Then run `bash start-openbot.command --restart`. Open **Bots → Local Qwen → Message
Local Qwen**. The local service uses loopback port 4207. Doctor checks its health
when enabled. Doctor separately checks the host Ollama API and whether the
configured model is installed. These read-only probes do not load or download a
model and do not establish inference quality or Docker-to-host connectivity.
Changing `LOCAL_BOT_MODEL` takes effect after restart. To disable it, set `OPENBOT_LOCAL_MODEL=false` and restart.

The first model load and prompts with many tools can take longer than subscription
models. Local inference requests cap output at 2048 tokens, disable thinking mode,
and use a 120-second model request timeout with no automatic retries. Model/tool
quality is not established by a successful health check.

## Security and rebuilding

The placeholder `OPENAI_API_KEY=ollama` satisfies the OpenAI-compatible client and
is not a billable provider key. The agent still requires OpenBot's deployment token;
unauthenticated requests return HTTP 401. Server routing sends that token only to
explicitly configured managed endpoints. Tool callbacks retain existing run assertions,
policy checks, and audit controls. Folder access still requires native approval.

Changes to the shared LangGraph agent code require `bash rebuild-openbot.command bots
--apply`, followed by restart. This rebuild updates the image used by both ChatGPT
and Local Qwen; local inference options apply only to the local service.

## Validation on October 10, 2026

- Server type check passed.
- 10 runtime agent integration tests passed on a disposable database, including
  authentication of the third managed endpoint.
- 28 Doctor/startup tests passed, including enabled-local-model failure detection.
- Direct local AG-UI inference completed and unauthenticated access returned 401.
- OpenBot chat returned the requested marker `MAPLE-LOCAL-42`.
- A real browser tool opened example.com and returned the title Example Domain.
- A full restart preserved the conversation and browser computer; a follow-up
  correctly recalled `MAPLE-LOCAL-42` from restored conversation history.
- Doctor reported ready, and Claude/ChatGPT both completed live response checks
  after the final restart.

No general, knowledge, or risk-assessment Bot has been switched to this model.
The local Bot is a separate evaluation target. Managed Intelligence remains a
service dependency; this change does not create a fully offline deployment.

## Diagnostic checks

- `local-model`: the authenticated agent service is running (the health route is public).
- `local-model.runtime`: the host Ollama API responds with model-list metadata.
- `local-model.installed`: the model selected by `LOCAL_BOT_MODEL` is installed.

An unavailable runtime or missing model fails readiness. When the feature is
not enabled, Doctor does not contact Ollama. An unqualified model name is matched
to its `:latest` tag. Eighteen Doctor tests pass, including offline-runtime,
missing-model, and disabled-profile cases; the live workstation passes all three
local-model checks.
