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
