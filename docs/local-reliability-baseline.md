# Local reliability baseline

Checkpoint prepared October 10, 2026, before starting the reliability improvements.

## Repository

- Fork: https://github.com/kgumbs/OpenBot (`origin`).
- Original: https://github.com/CopilotKit/OpenBot (`upstream`).
- Working branch: `codex/local-reliability`.
- Original checkout baseline: `aff4981e0734f15ff2fc68c86a32f765e0cae2b2`.
- Fetched upstream tip: `a4dce8c47c7253ecd9bd6f4e2626f4205817a104`.
- Three upstream commits are pending review; none were merged during preparation.
  They cover sidebar Bots/Skills, team account ownership, and an httpx2 test fix.

Existing fintech catalog activation is checkpointed separately from the local
subscription/desktop/sandbox setup. This preserves the existing customization
without mixing it into future Doctor and restart changes.

## Verified current configuration

| Check | Result |
| --- | --- |
| Launcher prerequisites | Pass; pinned Bun 1.3.14 and existing desktop executable |
| Web, Claude, ChatGPT, computer, supervisor endpoints | HTTP 200 |
| PostgreSQL and five Compose services | Healthy |
| Intelligence | Licence valid; entitlements ready |
| Registered Bots | Eight |
| Native desktop broker | Connected; no active folder grants |
| Server and supervisor TypeScript checks | Pass |
| Shell startup/login syntax and Git whitespace checks | Pass |
| Startup, browser routing, research declaration, supervisor tests | 33 pass |
| Tenant validation and database integration | 57 pass |
| Native folder-access tests | 19 pass |

The tenant suite ran against a newly created test database, migrated separately
and removed afterward. The live `openbot` database was not used for tests.
The native build initially referenced the old checkout location; clearing the
Tauri dependency caches allowed all 19 tests to pass from the moved clone.

These are targeted checks, not a full project test suite. Earlier live ChatGPT
browser verification opened example.com and returned its title. Provider endpoints
were rechecked here, but a new model-generation test was not run. Folder operations
still require the owner's native approval before a live access test.

## Secrets and workstation state

Private environment keys, ChatGPT OAuth data, the pinned Bun binary, and the staged
Intelligence reconnection directory are ignored by `.env` / `.env.*` rules.
Checkpoint sources were checked against saved credentials and credential patterns;
no private credentials were found. The public upstream example encryption key is
already present in the original desktop source and is not a newly disclosed key.

This checkout's `.git/info/exclude` keeps the following workstation state local:
`.copilotkit/`, `.openbot-dependencies.json`, `.openbot-deployment`,
`.openbot-prepared.json`, `container-images.json`, and
`test-openbot-file-finder.txt`. They were preserved on disk. These exclusion rules
are local Git settings and are not automatically copied to another checkout.
No environment files, OAuth stores, logs, generated binaries, or workstation
metadata are included in the source checkpoint.

This is a local development setup, not a production deployment review.

## First improvement: Doctor command

Implement a read-only command with human-readable and JSON output. Its acceptance
criteria are:

1. Check Bun, Docker/Compose, endpoint health, database reachability/schema,
   configured providers, and required desktop assets without revealing secrets.
2. Distinguish upstream outage, invalid credentials, missing setup, and local
   process failure. An Intelligence HTTP 503 must never suggest rotating keys.
3. Correlate desktop process state with a recent broker handshake; a stale
   `connected` flag alone must not count as readiness.
4. Detect non-root browser volume ownership problems and explain a scoped repair.
5. Distinguish connected folder broker from approved folders. Do not approve
   folders or perform writes just to check health.
6. Return documented readiness/degraded/failure exit statuses. Use bounded timeouts
   and regression fixtures for the failures already encountered.

## Second improvement: startup and restart

Build on Doctor rather than adding independent probes. Make restart deterministic,
prevent duplicate desktop processes and token mismatches, and preserve database,
browser storage, and existing credentials. Report degraded Intelligence availability
explicitly rather than printing an unconditional Ready message. Add tests for stale
broker state, provider failures, Docker delays, and moved checkout paths.

## Remaining limitations

- Broker status can remain stale briefly after the desktop exits; the launcher
  currently trusts it. This was observed during the browser-routing restart.
- Existing root-owned browser volumes were repaired manually. Ownership migration
  needs a supported, scoped path before new non-root deployments are distributed.
- Folder error messages do not identify the protected-path reason.
- Rust build tools are currently in temporary storage; normal startup uses the
  persisted executable. A durable rebuild workflow is still needed.
- The startup profile reuses local images. Source edits require explicit rebuilds.
- Both subscriptions remain optional custom integrations; ChatGPT uses an
  experimental integration, not a standard model API credential.
- No local Intelligence stack or subscription-free model profile is installed.
  Local Intelligence requires more Docker memory than the present allocation.

## Upstream update workflow

Fetch upstream, inspect the commits, and merge on a dedicated update branch from
this checkpoint. Preserve local secrets and source changes; never reset this
branch to upstream. Run the targeted checks above plus tests appropriate to the
upstream changes before restarting the local stack. Keep updates separate from
the Doctor implementation so failures have a clear cause.

The optional local-model profile follows the reliability work and must retain the
working subscription configuration until chat, tool use, and persistence are verified.

## Progress since this checkpoint

The original verification and limitations above describe the pre-improvement snapshot. The reliability branch now includes:

- Read-only Doctor diagnostics with human/JSON output and bounded probes.
- Startup readiness checks, clone-specific desktop detection, and explicit restart.
- Actionable protected-folder error messages with private paths omitted.
- Preview-first, scoped browser-volume ownership repair with disposable-volume integration coverage.
- Local source rebuild plans and persistent Rust tooling for this workstation.
- Browser image freshness checks to identify rebuilt images awaiting container recreation.

Remaining work includes reviewing pending upstream changes, providing a managed way to recreate individual Bot computers while preserving volumes, and evaluating the optional local-model profile. The subscription and managed Intelligence configuration remains the working baseline.
