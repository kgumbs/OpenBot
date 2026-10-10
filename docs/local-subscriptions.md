# Start OpenBot locally: current Claude Pro and ChatGPT Plus configuration

## Current status (checked October 8, 2026)

The web app responds at http://localhost:3010. PostgreSQL, supervisor, computer,
Claude SDK, and ChatGPT containers are healthy. The desktop host broker is
connected; no native folders are currently approved. The older sample Bot
containers are also running but are unused by this configuration.

## Normal startup

Credentials and dependencies are already configured. You do not need to sign in
again on every startup.

1. Double-click `start-openbot.command` in Finder, or run this one command in Terminal:

   ```sh
   bash /Users/kgumbs/OpenBot/start-openbot.command
   ```

   The launcher finds its own clone location, selects the saved Bun 1.3.14 runtime,
   starts Docker Desktop, starts both subscription services, and launches the native
   desktop app with folder access. It reuses an already-connected desktop session.
   If an offline desktop instance is open, quit it and rerun the launcher.
2. Keep the launcher Terminal and the native OpenBot app open. The app opens
   **Admin → Computers**. You can also use http://localhost:3010 in your browser.
3. Select **Choose folder** for the intended Bot and approve a folder through the
   native picker. `/Users/kgumbs/development/BotFiles` is the dedicated shared
   folder created during setup. Repeat for every Bot needing access. Grants start
   read-only and must be selected again after a host restart.

For a prerequisite check that does not start or stop services:

```sh
bash /Users/kgumbs/OpenBot/start-openbot.command --check
```

### How folder selection is enabled

The launcher calls `scripts/start-desktop-host.sh`, which generates an ephemeral
host token in memory and supplies the same token to the API and native desktop
app. The API is restarted to load it. The desktop attaches its native approval
broker to that API and opens Admin → Computers. An attached broker enables folder
selection; the ordinary web/subscription startup alone does not.

Each grant still requires the native folder picker. The checkout at
`/Users/kgumbs/OpenBot`, its ancestors, credential folders, and system folders
remain protected. No grant is automatic. Closing the native app disconnects the
broker and ends its session grants.

Use General Assistant (Claude), Knowledge (Claude), or Risk Analyst (Claude),
or their ChatGPT counterparts. Claude Pro and ChatGPT Plus are also available
as standalone Bots. External document sources require their own connector grants.

To check the desktop connection:

```sh
curl -s http://127.0.0.1:3001/api/host-access
```

`"connected":true` means the native broker is available. An empty `grants` list
means you still need to choose folders.

## Shut down

Quit the native OpenBot app first. Then, in another Terminal:

```sh
cd /Users/kgumbs/OpenBot
export PATH="$PWD/.env.tools/bun/bin:$PATH"
bash scripts/start-subscriptions.sh --stop
```

## If startup needs repair

- If Docker is unavailable, open Docker Desktop and wait for its engine before
  retrying.
- If folder access says offline, quit the native app and launch again with
  `start-desktop-host.sh`. The ordinary subscription launcher alone does not
  connect native folder access.
- If Claude authentication expires, run `claude setup-token` yourself, update
  `CLAUDE_CODE_OAUTH_TOKEN` in `.env`, then restart.
- If ChatGPT authentication expires, run `bash scripts/login-chatgpt.sh`, finish
  the browser sign-in yourself, then restart.
- If the desktop executable is missing or you edit its Rust source, rebuild it
  using the commands below. A normal startup does not require Rust or a rebuild.

The Rust toolchain installed during setup is currently in temporary directories.
While those directories still exist, rebuild with:

```sh
cd /Users/kgumbs/OpenBot/desktop
export PATH="/Users/kgumbs/OpenBot/.env.tools/bun/bin:/private/tmp/openbot-cargo/bin:$PATH"
export CARGO_HOME=/private/tmp/openbot-cargo
export RUSTUP_HOME=/private/tmp/openbot-rustup
bun run tauri build --debug --no-bundle
```

If those temporary Rust directories have been removed, install a Rust toolchain
before rebuilding. The already-built executable remains in the clone.

## Configuration reference

This local configuration uses separate containers and credentials. Claude powers
the built-in General Assistant and Knowledge Bots, Risk Analyst, and the Claude
Pro Bot. ChatGPT Plus is a separate remote Bot. Intelligence settings remain in
the root `.env`; its key is still required.

Use Bun 1.3.14, Docker Desktop, and installed dependencies.

## Credentials

Run `claude setup-token` yourself and save its token as
`CLAUDE_CODE_OAUTH_TOKEN` in the root `.env`. The Claude container receives this
token and the deployment token, not an Anthropic API key.

Run `bash scripts/login-chatgpt.sh` yourself, open the printed URL, and sign in
with ChatGPT. This uses the repository's experimental LangChain Codex integration.
The git-ignored `.env.chatgpt/` directory holds its OAuth store and refreshed
tokens. Do not set `CHATGPT_AUTH_FILE` on the API server: the two subscriptions
are separate, and Claude remains the built-in model.

## Start and stop

```sh
bash scripts/start-subscriptions.sh
bash scripts/start-subscriptions.sh --stop
```

Open http://localhost:3010. Choose Claude Pro or ChatGPT Plus when starting a
channel. General Assistant, Knowledge, and Risk Analyst also each have explicitly
named Claude and ChatGPT versions. Their role instructions, package skills, and
channel permissions match; external connector grants remain per Bot and must be
updated separately when new sources are connected. Existing Claude Bot IDs and
conversation history are preserved.

The launcher uses `examples/local-subscriptions`, copied from the fintech
example, so Bot and branding edits can be made there without editing that example.

The ChatGPT service is enabled when its OAuth store exists. Its model defaults to
`gpt-5.5`; set `CHATGPT_BOT_MODEL` in `.env` to choose another model your subscription
allows. This setting is confined to the ChatGPT container.

The two Bot ports, 4212 and 4206, are published on loopback. Their exact addresses
are added to the allowed Bot endpoints. ChatGPT calls governed tools through
OpenBot's signed callback; its container receives `AGENT_TOOL_TOKEN` for that
purpose. Credentials are not copied to the tenant package.

Local migrations run with Bun rather than building the production web image.
Starting this profile restarts the API so it reads the selected model and endpoints.
Docker's standard API-key sample Bots may remain from a previous startup; this
profile does not use them.

## Native Mac folder access from this clone

The source-built desktop app can attach its native approval broker to this stack:

```sh
bash scripts/start-desktop-host.sh
```

It expects the debug binary at `desktop/src-tauri/target/debug/openbot-desktop`.
Build it from `desktop` with `bun run tauri build --debug --no-bundle` and an
installed Rust toolchain. The launcher uses an ephemeral host token held in
process memory, restarts the API with that token, and opens Admin → Computers in
the native app. It uses the existing Docker engine and source-built computer image.

Choose a Bot's **Choose folder** button and complete the native folder picker.
Folder grants are separate per Bot and start read-only. File edits and commands
retain the existing native approval dialogs and sandbox restrictions. The broker
protects the OpenBot checkout containing the deployment credentials. Grants end
when host access stops; relaunch through this script to reconnect the desktop.

Starting the ordinary subscription launcher separately does not establish native
host access. Keep the native app running while using approved folders.

## Chromium sandbox on Docker Desktop

The subscription Compose overlay uses `openbot-agent-computer:sandbox-local`,
which runs as uid/gid 1000 with `COMPUTER_SANDBOX=on`. Both the shared computer
and supervisor-created computers keep no-new-privileges, drop all container
capabilities, and use `supervisor/chromium-seccomp.json`. This policy was derived
from Moby's default policy on October 9, 2026, with `clone`, `unshare`, `setns`,
and `chroot` allowed for Chromium's nested user namespace. The kernel still
checks namespace and chroot permissions; no SYS_ADMIN capability is added.
Source: https://github.com/moby/profiles/blob/main/seccomp/default.json
Playwright guidance: https://playwright.dev/docs/docker#crawling-and-scraping

After browser or supervisor source edits, rebuild explicitly:

```sh
cd /Users/kgumbs/OpenBot
docker build -f agent-computer/Dockerfile -t openbot-agent-computer:latest .
docker build -f agent-computer/Dockerfile.sandbox -t openbot-agent-computer:sandbox-local .
docker compose -f docker-compose.yml -f docker-compose.subscriptions.yml build supervisor
```

Normal startup reuses those images. The original root-owned browser volumes
were migrated to uid/gid 1000 when sandboxing was enabled; logins and workspace
files were preserved. A future import of root-owned volumes needs the same
ownership migration before a non-root browser can write them.

For checkpoint validation and the next development steps, see
[Local reliability baseline](local-reliability-baseline.md).

### Startup readiness and explicit restart

Run from this clone:

```sh
bash start-openbot.command
bash start-openbot.command --check
bash start-openbot.command --restart
```

The ordinary launcher reuses a healthy desktop only after Doctor verifies service readiness and matches this clone's executable to a running process. An attached desktop with failing services produces diagnostics and directs you to an explicit restart. A disconnected desktop is left in place until you quit it or request `--restart`, because replacing its memory-only broker credential would break its connection.

`--check` checks prerequisites only. ChatGPT sign-in is optional: without its saved auth store, startup runs Claude only. New startup waits for the broker and local services, retrying Doctor up to ten times with 1.5-second per-probe deadlines. An upstream Intelligence outage can produce degraded readiness while leaving the interface available; failed checks are reported explicitly. Probe count and container count determine the total wait.

`--restart` sends SIGTERM only to desktop processes whose full executable path matches this clone, waits for exit, then invokes the subscription stop/start workflow with `--keep-computers`, keeping existing Bot computers running. It interrupts running work and preserves database/browser volumes. Native folder approvals are now remembered for this clone/project and revalidated after reattachment. Explicit revocation remains permanent. Restart sequencing is covered with isolated launcher fixtures; the healthy reuse path has also been checked against the running deployment.

Use [Doctor](doctor.md) for read-only diagnosis at any time.

### Folder-selection explanations

The desktop reports why a selected folder is blocked:

- The filesystem root exposes the whole computer.
- The home folder or a parent folder is too broad to share.
- A folder overlaps a protected OpenBot or administrator-configured location, including the clone itself or a parent containing it.
- A folder is within, or contains, protected credentials, browser profiles, or system locations.

Select a dedicated folder such as `/Users/kgumbs/development/BotFiles` outside the protected clone and credential locations. The message does not disclose protected absolute paths. Symlinks are resolved before validation, so a shortcut does not change access restrictions. No folder is granted automatically.

These messages are native desktop code: use the rebuilt executable on the next desktop restart. The existing process continues using its previous version until restarted.

For imported root-owned browser volumes, use the [preview-first storage repair command](browser-storage-repair.md). Healthy running volumes do not need migration.

Use the [local rebuild command](local-rebuild.md) after editing desktop, browser, supervisor, or subscription Bot source. It previews the build plan and uses persistent Rust tooling for native builds.

### Remembered native folder approvals

Folders approved through the native picker are now saved for this clone and Intelligence project. Restart restores those approvals only after the desktop validates each existing canonical folder against current protected-path rules and the API accepts the original Bot/user binding. It does not approve new folders. Writes and commands retain their existing confirmation/policy checks.

The launcher binds saved approvals to the clone location and Intelligence API URL/key using a SHA-256 scope identifier. The credential itself is not written into approval files. Moving the clone or changing that project configuration requires fresh approvals.

Local state lives under ignored `.env.tools/host-grants/<scope>/`: `native.json` contains private folder paths; `server.json` stores only opaque grant IDs, Bot/user bindings, display names, and revocations. Files are created with owner-only permissions on macOS/Linux. Keep these files private and do not copy them into another project. Removing a grant or pressing Stop in Host Access saves its revocation, preventing stale native state from restoring it after a restart. Temporary disconnection suspends access until a fresh authenticated handshake.

Missing, protected, or invalid native approval data is not restored. Corrupt server revocation data blocks startup rather than risk restoring removed access; preserve it and diagnose the file before restarting. Approvals already lost before this feature was installed cannot be recovered; approve those folders once more through the native picker.
