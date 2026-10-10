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

The existing Claude and ChatGPT specialists retain their providers. Additional
local specialists are separate evaluation targets: General Assistant (Local),
Knowledge (Local), and Risk Analyst (Local Evaluation). Managed Intelligence remains a
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

## Local specialist Bots

All three additional specialists share the existing local agent endpoint and model.
Their roles and attached skills differ:

| Bot | Role | Attached skills |
| --- | --- | --- |
| General Assistant (Local) | Everyday planning and work | Bot and skill authoring |
| Knowledge (Local) | Source-grounded company answers | Find document, check claim, changes, ownership |
| Risk Analyst (Local Evaluation) | Evaluation only; human verification required | None by default |

They are available from the Bots roster and the corresponding package channel
allowlists. Skills do not grant access to documents, accounts, or native folders;
those require the usual separate approvals. With no source connected, Knowledge
must acknowledge the missing evidence rather than invent company policy.

Synthetic role checks cover a meeting plan, an unknown reimbursement limit, and
an incompletely documented payment. The initial risk response assumed a manual
override and overstated what missing evidence proves. Its role now explicitly
forbids those assumptions and unsupported regulatory/severity claims. These are
smoke checks, not a certification of compliance-review accuracy.

The subscription Compose override now sets supervisor `pull_policy: never`,
matching the local computer image reuse policy. Normal restarts use installed
images; source rebuilds remain explicit through the rebuild command. This avoids
a registry-dependent supervisor build on each startup. A missing image requires
an explicit computer/supervisor rebuild before startup.

### Specialist acceptance results

The general role completed the three-step planning prompt. Knowledge acknowledged
that a company reimbursement limit could not be determined without sources, both
in a direct role test and in the registered Bot's OpenBot chat.

Risk failed the evidence-discipline test twice. Even with explicit instructions,
it introduced unsupported regulatory thresholds and treated unprovided records
as proof of a control failure. Its display name and title identify it as an
evaluation Bot, and its role requires human verification. Do not treat its outputs
as compliance determinations. No access grants or decision automation were added.

Next: build a repeatable synthetic evidence evaluation before promoting a local
risk model or expanding its access. Test alternative installed models against the
same cases; passing basic chat and browser use is insufficient for this role.
