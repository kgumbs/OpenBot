# Local OpenBot diagnostics

From the clone, run:

```sh
bash doctor-openbot.command
bash doctor-openbot.command --json
```

The launcher selects the saved Bun runtime from `.env.tools/bun/bin` when present. Doctor reads this clone's `.env`; shell overrides are not included. It detects the subscription profile from the Claude credential, or accepts `--profile subscriptions` / `--profile standard`. Use `--timeout-ms 5000` to set each network/command deadline (100–30000 ms).

Exit codes: **0** ready, **2** degraded, **1** failed, **64** invalid arguments. JSON includes `schemaVersion`, `profile`, `state`, `exitCode`, and individual `checks` with status, message, and optional action.

Checks cover dependencies, local service endpoints, Intelligence licence/entitlements, Bot registration, PostgreSQL connectivity and coworker tables, desktop executable/process plus broker lease, and browser volume writability under the container's runtime user. Browser containers are selected from this Compose deployment and supervisor namespace labels. At most 32 are inspected. Each probe has a timeout; the overall duration depends on the number of containers.

Doctor does not restart services, modify the database, approve folders, migrate ownership, launch browsers, or make model calls. Credentials and raw error bodies are excluded from output. A saved credential and a healthy model service do not prove that a subscription token is current or that inference will succeed. Browser checks confirm non-root configuration and storage permissions; they do not prove Chromium's runtime sandbox behavior. Database checks cover required coworker tables, not complete migration parity.

An Intelligence outage is reported separately from an invalid/expired licence and from a local endpoint requiring sign-in. Do not rotate credentials to address an upstream 503. Zero folder grants are informational: select folders per Bot in Admin > Computers when needed. A connected broker flag without this clone's desktop process is degraded.

For unwritable browser storage, inspect only the affected container's `/profiles` and `/workspace` volume ownership and apply a scoped migration using the supported deployment workflow. Preserve data and sandboxing. For failed local service endpoints, check the corresponding service and startup configuration using [the subscription setup guide](local-subscriptions.md).

Regression tests:

```sh
.env.tools/bun/bin/bun test scripts/doctor.test.ts
```
