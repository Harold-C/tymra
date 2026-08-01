# Browser Collection Phase 1

Last updated: 2026-08-01

## Status and scope

Tymra now has a generic, read-only browser capture path for JavaScript-rendered pages. This phase proves browser execution and evidence handling; it does not yet parse OTA prices or feed browser output into pricing recommendations.

The design is adapted from Synix browser automation at commit `d56aa63286549c98980278dd40fba0a775e08a0a`. Reused concepts are the isolated Browser Worker, Ulixee Hero runtime, read-only action policy, neutral extractor, evidence manifest, and manual-required result. Synix account, callback, handoff, Jarvis, and provider-specific code was deliberately excluded.

## Runtime flow

1. An operator invokes `browser:capture` with an approved `DataSource` key and URL.
2. Tymra Worker checks source enablement, internal approval, legal status, storage rights, operational health, and `supportedDomains`.
3. The private Browser Worker authenticates the request, validates HTTPS, host, DNS, private-address status, port, and redirect chain.
4. Ulixee Hero `2.0.0-alpha.34` renders the page through the Synix-compatible Ulixee Cloud `2.0.0-alpha.33` service with pinned Chrome `136.0.7103.113`.
5. The neutral extractor captures rendered HTML, a full-page PNG, title, and final URL. CAPTCHA, login, and access challenges return `manual_required`; the worker does not bypass them.
6. Evidence is written to a dedicated volume. The application database stores only relative pointers, hashes, sizes, and capture metadata in `RawArtifact`.
7. Each approved source uses a stable anonymous browser Profile. The Profile is exported only after
   a successful non-challenge capture, encrypted with AES-256-GCM and atomically written to a
   dedicated persistent volume. Challenge, parser-failure and navigation-failure sessions never
   replace the last known successful Profile.

The Browser Worker accepts no arbitrary JavaScript and supports only `read_only_capture`. Its action policy denies typing, keyboard input, submit, save, send, upload, payment, and remote-state changes.

Browser sessions default to headed Chrome. Linux containers provide display `:99` through Xvfb, so
Chrome runs without the `--headless` flag while remaining isolated from an operator desktop.
`BROWSER_WORKER_HEADED=false` is the explicit diagnostic opt-out; production and development both
inherit the headed default.

`showChromeAlive` and `sessionKeepAlive` remain disabled. They are desktop debugging controls, not
requirements for headed rendering, and enabling them in a long-running collection service retains
completed Chrome sessions until the Ulixee process is restarted.

HTML-only scheduled captures block images, fonts, icons and media, plus known advertising and
analytics endpoints. Page scripts and styles remain enabled because Eventfinda pagination and card
rendering depend on client-side execution. Full-evidence captures do not apply these resource
blocks, so challenge screenshots and manual diagnostics retain the rendered visual state.

Ulixee Cloud has a 4 GiB container memory limit and a 512-process limit in development and
production. Browser collection remains single-concurrency. After Hero closes its session, Browser
Worker terminates its owned client transport directly; this avoids an Ulixee alpha shutdown race
where `Core.disconnect` closes the server socket before its response is written.

The capture timeout is an end-to-end task deadline covering navigation, DOM/title/URL capture,
challenge polling, extraction and Profile export. A hung browser operation therefore reaches the
normal failure manifest and session close path instead of occupying the only browser slot after the
Worker client has timed out. The Worker client allows a separate 15-second close/response margin.

Challenge matching requires explicit verification actions or terminal block text. An ordinary
footer such as `This site is protected by reCAPTCHA` is not a challenge. The Xvfb entrypoint removes
stale display locks and verifies the live X11 process/socket before starting Ulixee Cloud, so a
container restart cannot leave headed Chrome without a display.

The Browser Worker permits only one active task for a given `profileKey`, preventing concurrent
sessions from racing and overwriting the same Profile. Profile files are mode `0600`; production
must provide an independent `PROD_BROWSER_PROFILE_ENCRYPTION_KEY`. Development may fall back to the
Browser Worker token, but a distinct local secret is recommended. Health output reports only the
mode and active Profile count, never Profile contents.

Tymra keeps Ulixee's coherent Chrome identity and does not override the user agent with a mismatched
operating-system string. The anti-block controls are conservative request pacing, stable successful
Profile reuse, source-level single flight, semantic challenge detection and cooldown. Proxy rotation,
CAPTCHA solving, fingerprint spoofing and randomized user simulation are explicitly out of scope.

## Local operation

Development Compose keeps `browser-worker` and `ulixee-cloud` in an opt-in `browser` profile because headed Chrome remains warm between captures. The controlled `browser-fixture` is an opt-in `test-fixture` profile and is the only HTTP/private-network exception. Development scheduling remains disabled through `SCHEDULER_ENABLED=false` and the Scheduler container is an opt-in profile; seeded schedules remain disabled.

Ulixee Cloud is available on host port `1819` for local diagnostics because Synix already owns host port `1818`; the Tymra container network continues to use `ulixee-cloud:1818`.

```bash
docker compose run --rm --build seed
pnpm compose:browser:up
docker compose --profile browser --profile test-fixture up -d browser-fixture
docker compose exec worker ./node_modules/.bin/tsx src/cli.ts browser:health
docker compose exec worker ./node_modules/.bin/tsx src/cli.ts browser:capture \
  --source browser-neutral-fixture \
  --url http://browser-fixture
```

Use `--dry-run` to execute and validate capture without creating `RawArtifact` rows. A `CollectionRun` is still recorded for operational audit.

## Production controls

Production uses a dedicated `PROD_BROWSER_WORKER_TOKEN`, blocks HTTP and private networks, and does not expose Browser Worker ports publicly. Browser Worker and Ulixee Cloud share a dedicated internal control network; only Ulixee Cloud joins the egress network, and it is not attached to the application/database network. A source must be explicitly approved and populated with exact supported domains before it can be captured. Production scheduling is configured separately; introducing this service does not add a schedule.

Raw evidence expires after `RAW_ARTIFACT_TTL_HOURS` (72 by default). Browser files are deleted by the Browser Worker cleanup loop; database pointers are marked deleted by the existing Tymra retention job.

Eventfinda and Ticketmaster originally established their source-specific extractors and crawl
frontiers on this runtime. They now use Argus asynchronous browser Jobs when configured; this
private Browser Worker path remains a development fallback. See
[Argus browser collection boundary](../collection/argus.md),
[Eventfinda New Zealand collection](../collection/eventfinda.md), and
[Ticketmaster New Zealand collection](../collection/ticketmaster.md).

Rendered HTML is written before a source extractor runs. Full-evidence captures always include a
screenshot; HTML-only scheduled captures add initial and settled screenshots only when challenge
markers are detected. If extraction fails, loaded evidence remains in the failure manifest so parser
or access behavior can be diagnosed without an immediate repeat request.

Every browser source, and every non-browser collection channel where the controls apply, must pass
the shared [local source collection acceptance](../collection/acceptance.md) standard
before it is described as locally verified.

## Next phase

The next phase should add one OTA-specific extractor at a time, with captured fixtures, selector/parser tests, rate normalization, source-specific usage review, throttling, and comparison against known observations. CAPTCHA bypass and authenticated operator sessions remain outside this generic phase.

## Current verification

The 2026-08-01 current-worktree image build passed. The combined Browser Runtime, site extractor and
Browser Worker suite passed 37/37 tests. The running local browser containers were healthy when
checked, and the running Browser Worker server, runtime and Ticketmaster extractor hashes matched
the current worktree. Runtime health still does not replace a fresh live-source or E2E acceptance.
