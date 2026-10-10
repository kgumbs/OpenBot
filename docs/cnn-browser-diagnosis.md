# CNN browser diagnosis

Observed October 10, 2026 in Knowledge (Local)'s managed browser.

- example.com navigates successfully with title Example Domain.
- www.cnn.com displays Unknown Error with an empty title.
- Host and container plain HTTP requests both retrieve CNN's full HTML.
- Installed browser: Chromium 151.0.7922.34; managed mode is headless.

A controlled HTTP comparison from the same Bot container varied only the User-Agent
browser identity, using the same Chromium 151 version and other request fields:

| Identity | Status | Response |
| --- | --- | --- |
| Chrome/151.0.0.0 | 200 | Approximately 6.7 million characters; CNN page title present |
| HeadlessChrome/151.0.0.0 | 200 | 13 characters: Unknown Error |

This establishes server-side response variation based on the headless identity for
these requests. It is consistent with the managed browser's observed failure and
rules out a general DNS/connectivity outage. It does not establish CNN's internal
reason for that behavior, nor exclude additional browser-specific restrictions.
No page-script exception is required to explain the observed error document.

No browser identity, sandbox, certificate validation, or session settings were
changed. The manual view showed no visible CAPTCHA or sign-in prompt.

Next: evaluate the supported headed browser mode on an isolated computer, keeping
sandboxing enabled. Do not spoof the browser identity as a substitute for diagnosis.
A successful headed-mode test is needed before changing the live Bot configuration.

## Isolated headed-mode result

The sandbox-local image was tested in a disposable container with
`COMPUTER_BROWSER_MODE=headed`, `COMPUTER_SANDBOX=on`, UID 1000, all capabilities
dropped, no-new-privileges, the existing Chromium seccomp profile, temporary
profiles/workspace, and no published ports or user credentials. The virtual X
display started successfully.

A fresh computer initially refused both sites because no egress policy had been
pushed. Retesting with an explicit allowlist limited to cnn.com and example.com
succeeded:

- example.com: title Example Domain.
- www.cnn.com: title Breaking News, Latest News and Videos | CNN; normal page text.

The browser process was headed and reported sandbox on. No browser identity
spoofing or sandbox disabling was added. This confirms primary-page navigation,
not all CNN media, trackers, scripts, or links; the test allowlist was deliberately
narrow. The test container and temporary token file were removed afterward. No
live Bot container, profile, or policy was modified.

Next: apply headed mode to the intended live Bot computer using a scoped update
that preserves its browser profile, then repeat navigation through OpenBot chat.

## Live Knowledge (Local) verification

The local subscription supervisor now uses `COMPUTER_BROWSER_MODES={"knowledge-local":"headed"}`.
Only Knowledge's container was recreated, retaining `openbot-profile-knowledge-local` and
`openbot-workspace-knowledge-local`. The live computer confirms headed mode, sandbox on, UID 1000,
dropped capabilities, no-new-privileges and the Chromium seccomp policy.

Chat navigation initially encountered the existing handback guard: “Take a fresh browser snapshot
after handback before acting.” After the Bot took that snapshot, navigation through OpenBot chat
succeeded and the browser activity displayed the observed title:
`Breaking News, Latest News and Videos | CNN`. This verifies the main page, not every media feature.

Validation: 34 supervisor unit tests passed and supervisor TypeScript checking passed. The full
suite's Docker integration test stalled and was interrupted; no integration-suite success is claimed.

Next: improve browser tool error handling so a required fresh snapshot is handled automatically and
an empty title is not presented as a successful navigation.

## Automatic navigation recovery after handback

The server gateway now handles the computer's explicit `snapshotRequired` refusal for navigation:
it takes a fresh snapshot, then retries navigation once through the normal policy and control
checks. This applies only when the computer confirms navigation was refused before it began.
Human-control refusals, ordinary stale references, and other navigation failures are not retried.
Clicks and typing still require the Bot to reassess the fresh page and select current references.
A repeated snapshot-required refusal is surfaced rather than looping.

Validation: 83 gateway/headless-tool tests passed, including recovery, bounded retries and
no retry during human control; server TypeScript checking passed.

Next: improve how the Bot reports failed navigation and empty page titles in conversation.

Activation: the subscription startup script restarted the API with this change. A live
Knowledge (Local) take-control/handback cycle succeeded, but its subsequent chat turn hit the
60-second silent-stream timeout before returning a result. End-to-end recovery therefore remains
unverified in this run. Doctor reported the native folder broker disconnected; API and computer
health endpoints responded. These runtime issues are separate from the passing regression tests.

## Follow-up: stalled browser and misleading timeout errors

The original computer response was HTTP 502, `ariaSnapshot: Timeout 30000ms exceeded.`
The server incorrectly mapped every Playwright timeout to a missing-element error. It now maps
only locator failures naming an `aria-ref` that way; general browser timeouts retain their original
message as computer-unavailable errors. Regression coverage includes navigation and snapshot timeouts.

Knowledge's browser was consuming approximately 172% CPU and 1.49 GiB when inspected. This is an
observation, not proof of the cause of the separate model stream stall. Restarting only its computer
restored snapshot/navigation responsiveness and retained its profile and workspace.

Live API verification then completed request-help, take-control, handback and navigation to
example.com: all four returned HTTP 200, with title `Example Domain`. No manual snapshot call was
made between handback and navigation, verifying the gateway's automatic recovery against the real
computer. The local model's silent-stream timeout has not been independently proven resolved.

Validation: 111 client/gateway/headless tests passed; server TypeScript check passed.
Next: check the local model's response latency and the disconnected desktop folder broker.
