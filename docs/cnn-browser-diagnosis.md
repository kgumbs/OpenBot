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
