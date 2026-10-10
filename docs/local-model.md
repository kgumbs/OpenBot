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

See [repeatable local risk evaluation](local-risk-evaluation.md) for the runner,
rubric, and Qwen/Llama baseline. Neither model passed promotion criteria.

## Runtime recovery verification (2026-10-10)

After restarting the stalled Knowledge computer, the Ollama OpenAI-compatible streaming endpoint
returned its first chunk in 5.009 seconds and finished in 5.022 seconds for a synthetic READY prompt.
The subsequent Knowledge chat navigation completed without a new silent-stream timeout and its
browser activity confirmed `Example Domain`. Its final prose was only `is`, so complete model
answer quality remains unresolved; successful navigation does not establish correct final wording.

This deployment's `AGENT_STALL_TIMEOUT_MS=60000` is shorter than the local provider's 120-second
request timeout. No timeout was increased during this verification because the recovered run
completed without another watchdog event. Repeated slow runs should be measured before changing
those limits; increasing a watchdog alone does not fix stalled browser or inference work.

Next: trace the incomplete local model final answer through the provider's AG-UI stream.

## Completed live reply reconciliation

Investigation of the apparent `is` answer found the durable conversation held the complete
`The page title is "Example Domain".` sentence. Reloading recovered it. Synthetic direct-agent
probes, both plain text and after a browser tool result, produced matching complete streamed text
and final message snapshots. The loss was therefore observed in live client state rather than
established as model generation loss.

The channel now performs bounded durable-history reads after a successful turn and repairs fuller
text for assistant IDs created by that turn. It retains live tool metadata, leaves older turns and
user messages unchanged, never shortens text from a lagging store, and abandons repair when the
agent changes, another history read supersedes it, or a run becomes active.

Validation: two focused regression tests (five assertions) and app TypeScript checking passed.
A subsequent live channel turn displayed the complete example.com title sentence without reloading.
That turn reused available knowledge rather than showing a new browser activity row; the earlier
live browser navigation test remains the evidence for navigation itself.

Next: add an automated UI regression that compares the completed bubble with durable history.
