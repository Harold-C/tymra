# Tymra Product And Technical Decisions

Last updated: 2026-08-21

This file records current product and technical decisions. Decision history explains rationale but
does not create migration or compatibility requirements; current scope and verification status are
defined by the active product documents and `docs/traceability.md`.

## D-001 Preserve The Existing Root Web Application (Superseded)

**Decision:** Keep the compatible Next.js App Router application at the repository root and add
`apps/worker` plus the required shared packages.

**Reason:** The baseline says compatible existing code should be retained. Moving the current
2,800-line visual implementation into `apps/web` would create migration churn without changing
runtime boundaries or product behaviour. Root scripts still provide the exact required commands.

**Superseded by:** D-034. The product behaviour remains unchanged, but the Web application now has
the same explicit `apps/*` boundary as the other runnable processes.

## D-002 Use A pnpm Workspace With PostgreSQL Persistence And Redis Coordination

**Decision:** Use pnpm workspaces for `apps/*` and `packages/*`. PostgreSQL remains the durable job
system of record and uses row locking for claims. Redis provides distributed collection locks,
short-lived coordination and readiness checks.

**Reason:** Durable PostgreSQL jobs survive restarts and remain auditable, while Redis prevents
duplicate concurrent collection without becoming the sole copy of task state.

## D-003 Keep One Next.js Application For Public, API And Admin Surfaces

**Decision:** Public pages, Route Handlers and the admin application live in the same Next.js
deployment, with the worker as a separate process.

**Reason:** This reduces local operational overhead while retaining a strict server boundary.
It also lets secure HttpOnly sessions, API validation and noindex metadata share one origin.

## D-004 Database And Identifier Strategy

**Decision:** PostgreSQL with Prisma; application records use CUID-compatible string IDs. Immutable
or append-only records have explicit version/idempotency keys and no update path in normal services.

**Reason:** Prisma is required by the baseline. Opaque IDs are convenient for local and distributed
creation, while anonymous rough-task status uses a hashed access key and formal results use an
authenticated customer session with server-side ownership checks.

## D-005 Persistent Worker Claiming

**Decision:** Jobs are claimed transactionally with PostgreSQL locking semantics, a lease expiry,
attempt counter and deterministic idempotency key. Retry defaults are 1, 5 and 30 minutes.

**Reason:** This survives worker restarts and allows multiple workers without duplicate processing.

## D-006 Local Provider Modes

**Decision:** `demo` uses deterministic fixtures and is allowed only in development/test. `manual`
accepts validated CSV/JSON imports and only permits auto-publication when its registered source is
enabled and operationally healthy, and all quality gates pass.

**Reason:** This implements the provider contract without inventing or scraping an OTA source.

## D-007 Local Email

**Decision:** Host development supports `EMAIL_PROVIDER=log` as a zero-dependency option. Compose
defaults to SMTP through Mailpit so complete local messages can be inspected. Email logging stores
only delivery metadata and redacts verification links and tokens.

**Reason:** Both paths are locally demonstrable without external credentials.

## D-008 Admin Authentication

**Decision:** A single administrator is initialized from `ADMIN_EMAIL` and
`ADMIN_PASSWORD_HASH`. Password verification and session creation happen server-side. The session
cookie is signed, HttpOnly, SameSite=Lax, Secure outside plain local HTTP, and has a bounded lifetime.

**Reason:** Admin identity remains isolated from customer accounts, cookies and authorization.

## D-009 Secure One-Time Verification

**Decision:** Generate 32 random bytes for one-time verification tokens and anonymous rough-task
access keys. Persist only keyed hashes, never complete values. Verification tokens are purpose-bound,
single-use, expire after 15 minutes and are removed from the URL after consumption. Formal results
use authenticated customer sessions and do not support durable bearer result links.

**Reason:** This meets the 256-bit requirement, keeps short-lived secrets out of storage and prevents
URL possession from granting durable report access.

The host Web launcher additionally redacts verification route segments from Next.js development
access logs because framework request logging occurs below the application logger.

## D-010 Local Domain And Service Lifetime

**Decision:** Docker Compose is the reproducible and canonical full-stack environment. Web, Worker
diagnostics and Mailpit join the shared Traefik `local` network; internal services remain on the
project network. Docker restart policies plus a 60-second health-check LaunchAgent provide
always-on development access and restore missing Compose services. Separate host Web and Worker
LaunchAgents are legacy emergency fallbacks and must remain unloaded during normal operation.

**Reason:** One canonical runtime prevents duplicate workers and conflicting Web processes while
ensuring `https://tymra.test` survives terminal and Codex sessions. The configured runtime path is
explicit and health-checked.

## D-013 Result Version Lifecycle

**Decision:** Published result content is immutable. A published version may only transition to
`SUPERSEDED` or `WITHDRAWN`; lower-confidence and partial operator actions create a replacement
version, clone its insights with an audit limitation, publish it and supersede the old version.

**Reason:** This preserves the evidence used for every historical result while supporting the
required operational correction workflow.

## D-014 Build And Runtime Separation

**Decision:** Production builds use `.next-build`, while the always-on development server keeps
`.next`. Admin operations are explicitly `force-dynamic`.

**Reason:** A build can run without corrupting the active development cache, and build-time static
generation never queries operational database pages.

## D-011 Demo Data Isolation

**Decision:** Deterministic demo records use an explicit `isDemo` marker, a reserved source key and
visible `Development Demo Data / Not real market data` labels. Production startup rejects demo mode.

**Reason:** A separate database is not sufficient by itself to prevent accidental presentation or
publication of demo observations.

## D-012 Existing Visual Asset

**Decision:** Keep the current raster logo only as a repository asset reference and use the required
text fallback until a formal SVG is supplied. Do not generate a replacement brand mark.

**Reason:** The visual baseline explicitly prohibits redesigning the logo.

## D-015 Two-Stage Customer Funnel

**Status:** Product-approved; the two-stage flow is implemented, but current two-mode input and
hidden-entry acceptance require fresh verification.

**Decision:** Replace the email-first public flow with two stages: an anonymous low-cost rough result,
followed by email verification and an authenticated formal Price Check. The rough result must provide
real value while reserving exact dates, detailed comparable evidence and formal actions for the
authenticated report.

**Reason:** Asking for identity before demonstrating value weakens conversion, while running full
provider collection anonymously creates uncontrolled cost and abuse exposure.

## D-016 Customer Identity Is Separate From Admin

**Status:** Product-approved; implemented and locally verified.

**Decision:** Introduce a passwordless customer identity such as `CustomerUser`. Verification may
create or resume an `OPERATOR` customer account, but no public action can create, grant or elevate an
`AdminUser`. Customer and Admin sessions, cookies, guards and authorization remain separate.

**Reason:** "Automatically becoming a user" must never imply automatic operational or administrator
privileges.

## D-017 Create Or Resume The Customer Only After Verification

**Status:** Product-approved; implemented and locally verified.

**Decision:** Email submission creates a pending verification request only. Successful one-time
magic-link consumption creates or resumes the customer, binds the anonymous check, creates a session
and removes the token from the URL. The operation is idempotent and transactionally consistent.

**Reason:** This prevents unverified addresses from creating active accounts and gives one clear
point at which identity, ownership and consent become effective.

## D-018 Verify Before Formal Provider Cost

**Status:** Product-approved; implemented and locally verified.

**Decision:** Anonymous rough analysis uses validated cached or aggregate evidence. Formal provider
collection is enqueued only after email verification or by an already authenticated eligible
customer.

**Reason:** Verification is the cost boundary that prevents random addresses and email bombing from
consuming provider, Worker and storage resources.

## D-019 Authenticated Formal Reports

**Status:** Product-approved; authenticated ownership is implemented, but obsolete bearer-result
route removal and fresh route acceptance remain unverified.

**Decision:** Formal reports are protected by customer sessions and server-side ownership checks.
Durable bearer result tokens are not a supported customer access model; public sharing is deferred.
No legacy result-link compatibility path is required.

**Reason:** Session-owned reports provide revocation, history and cross-account isolation without
placing durable report authority in a URL.

## D-020 Minimal Conditional Email

**Status:** Product-approved; implemented and locally verified.

**Decision:** A normal flow sends one `VERIFY_AND_SIGN_IN` email. Publication starts a configurable
two-minute notification grace period. The authenticated page records an idempotent acknowledgement
only after the terminal result renders; the terminal email is sent when that acknowledgement is
absent at the end of the grace period. Partial, insufficient and failed terminal emails replace
`RESULT_READY`. `CHECK_RECEIVED`, in-page `CONFIRMATION_REQUIRED` and immediate
`CHECK_PROCESSING` are not part of the current happy path.

**Reason:** Conditional delivery reduces noise and avoids sending messages that repeat the page the
customer is already using.

## D-021 Layered Abuse And Quota Controls

**Status:** Product-approved; cooldown, caching, idempotency and quota implemented. Interactive
challenge escalation remains `not_implemented`.

**Decision:** Apply configurable device, IP, email, property and customer controls with three outcomes:
allow, challenge, and cooldown/reject. The device key is a first-party random cookie, not invasive
fingerprinting. Reuse equivalent rough computation for six hours. During the pilot, recommend 5
rough checks/device/hour, 10/IP/hour, 3 magic-link emails/address/hour, and formal quota of the
included first check followed by 1/day and 5/rolling 30 days. IP alone is never the only blocking
signal.

**Reason:** Progressive controls protect cost and email reputation without unnecessarily blocking
operators on shared hotel or office networks.

## D-022 No Exclusive Property Claim

**Status:** Product-approved; implemented and locally verified.

**Decision:** Customers own Price Checks and reports, not the public property identity. Multiple
customers may analyse the same property. PMS ownership verification, teams and organisation roles are
deferred.

**Reason:** Exclusive claims require stronger business verification and support processes that are
outside the current product scope.

## D-023 Proposed Retention Defaults

**Status:** Product-approved defaults implemented and locally verified; final privacy approval remains
pending.

**Decision:** Retain anonymous rough checks for seven days, unused verification requests for 24 hours,
token security metadata for 30 days and privacy-preserving abuse records for 30-90 days. Active
customer reports remain subject to account deletion and the final approved product retention policy.

**Reason:** Short anonymous retention limits personal-data exposure while preserving enough security
history to enforce cooldown and investigate abuse.

## D-024 Real-State Motion

**Status:** Product-approved; implemented and verified with desktop/mobile reduced-motion automation.

**Decision:** The rough-result experience may use expressive motion, but each progress stage maps to a
real server state or completed subtask. Ready results are not artificially delayed, reduced motion is
complete, and animation failure cannot block the result.

**Reason:** The desired experience should feel sophisticated without misrepresenting work or reducing
accessibility and reliability.

## D-025 Supported OTA Link Or New Zealand Address With Explicit Target Mode

**Status:** Product-approved current contract; implementation and fresh two-mode acceptance require
audit.

**Decision:** The anonymous new-visitor flow accepts either a valid supported OTA listing URL or a
resolvable New Zealand address. A URL selects `LISTING_PRICING`; an address selects
`LOCATION_BENCHMARK` with `targetListingId=null`. The flow does not ask the visitor to select dates,
guest count or room type. URL mode uses supported pricing context carried by the URL when present or
captures the OTA's observed default listing context. Address mode uses the standard Stay Query and a
bounded, disclosed geographic expansion to find nearby public listings.

Tymra must normalize the platform and stable listing ID, remove unrelated and sensitive URL
parameters, record the source, observed context and capture time, and disclose the relevant context
with the rough result. A syntactically valid link is insufficient: an inactive, inaccessible,
unsupported or non-price-bearing listing returns an honest terminal state and no fabricated price.
Address mode must resolve a stable Property／spatial anchor, keep every price attributed to its
actual nearby Listing, and never describe a neighbourhood observation as the submitted property's
own price. Address and URL variants that resolve to one physical Property share one membership slot.

**Reason:** Many operators know only a physical address and need surrounding market prices, while an
OTA URL permits a target-specific price result. Explicitly separating the modes preserves honest
price attribution without excluding either valid customer need.

## D-026 Worker Baseline v1 Source And Fixture Boundary

**Status:** Implemented and locally verified on deterministic fixture/public-source paths.

**Decision:** Formal analysis is anchored to Property, SellableUnit and Listing. PostgreSQL stores
immutable observations and versioned snapshots/results; Redis only coordinates. OTA adapters expose
one contract and deterministic research fixtures, but live collection remains unavailable until each
source has an operational implementation. Production forbids demo/fixture modes
and returns `SOURCE_UNAVAILABLE` instead of substituting generated data.

Public-signal collection must pass enabled and operational-health gates before network access. A
failed optional signal source is retained as a failed
`CollectionRun` but does not imply unavailable accommodation inventory. A blocked core rate source
ends the request as `SOURCE_UNAVAILABLE` without a result or notification email.

**Reason:** The product requires auditable real evidence, and fixture completeness must never be
misrepresented as permission or capability to collect live OTA data.

## D-027 Domain And Runtime Trust Boundaries

**Status:** Product-approved; implemented for local development and represented in production
Compose configuration. Production deployment and DNS remain `not_verified`.

**Decision:** Use environment-equivalent semantic hosts. `tymra.test`/`tymra.nz` contains the public
funnel, customer account, reports and same-origin `/api/v1` routes. `ops.tymra.test`/`ops.tymra.nz`
contains the operational Admin. Public requests to the legacy `/admin` path redirect to the
Operations host, while Admin APIs return not-found on the public host. Customer and Admin cookies
remain host-only and are never shared across the parent domain.

Local-only `worker.tymra.test` exposes health and readiness diagnostics, and `mail.tymra.test`
exposes Mailpit. Worker mutation and data endpoints remain available only through the loopback port
or Docker network. Production has no public Worker or Mailpit route. PostgreSQL, Redis, Worker and
Scheduler are always internal services. Internal Docker aliases use the project-qualified
`tymra-postgres`, `tymra-redis`, `tymra-worker-api` and `tymra-mailpit` names to prevent collisions
with other projects attached to the shared ingress network. Browser automation is a shared Argus
service: Tymra calls `api.argus.test`/`api.argus.nz`, while short-lived human handoffs use
`connect.argus.test`/`connect.argus.nz`. Tymra does not expose a product-owned noVNC hostname.

The shared host Traefik and external `local` network are the canonical local ingress. Compose
restart policies and a 60-second LaunchAgent health check restore the stack without depending on a
terminal session. Production hostnames are supplied through `HOST_PUBLIC`, `HOST_OPS`, `HOST_WWW`
and origin variables rather than embedded throughout application code. Production secrets and
runtime switches use a separate `PROD_*` namespace so the local `.env` cannot silently select demo
providers or reuse development credentials in a deployment.

**Reason:** Stable host semantics make development representative of production while keeping
customer identity, administrator authority, internal processing and diagnostic tooling in distinct
trust boundaries. Same-origin customer APIs avoid unnecessary CORS and parent-domain Cookie risk.

## D-028 Browser Event Collection Before Scheduling

**Status:** Implemented in development; production activation pending.

**Decision:** Eventfinda and Ticketmaster use the same read-only Browser Worker architecture; no
Ticketmaster API integration is retained. Development keeps event schedules disabled. Eventfinda
implements nationwide paginated discovery, a durable detail frontier, bounded local acceptance and
a development bootstrap mode with scheduler execution hard-disabled by environment.
Ticketmaster implements five verified city listing routes, a durable detail frontier, bounded detail
batches, exact-target canonical persistence, horizon-based refresh and exponential failure backoff.
Earlier captures stopped on its initial verification interstitial; two-stage evidence on 2026-07-21
proved that the same page can resolve to normal public event content after a bounded passive wait,
without a click, form input, login or challenge solution. Later live runs remained challenged after
10-20 seconds and correctly stopped, retained failure evidence and applied a six-hour cooldown.
Automated database acceptance proves two-pass idempotency, 72/168-hour evidence and unchanged
source configuration and schedules. This is development implementation evidence, not a claim of reliable
unattended production access.
Event facts are not automatically represented as `MAJOR_EVENT` demand signals without capacity,
attendance or other explicit impact evidence. Raw browser evidence has short retention.

Bounded local Eventfinda acceptance runs only with `NODE_ENV=development` and is capped at
one listing page and two detail pages, records `localAcceptance=true` on the collection run and does
not change the source's configuration or operational status. This development-only path cannot
enable schedules.

`--development-bootstrap` uses the same environment and configuration guards but allows the
configured nationwide page and detail-batch limits. It still enforces source locks, one browser,
4-7 second request spacing, daily budgets, challenge stop and cooldown. It exists to prove and seed
the complete development frontier without representing production authorization.

The 2026-07-21 nationwide bootstrap completed 187/187 listing pages, verified the pagination
boundary and upserted 2,821 detail targets with no retry or failure. A following five-target detail
batch persisted 51 advertised occurrences with no failure. Source configuration and schedules remained
unchanged; remaining detail hydration is deliberately paced operating work.

The same separation is mandatory for every future data-collection channel through the
[local source collection acceptance](collection/acceptance.md) standard.
Each source supplies its own hard bounds and evidence, while sharing the environment guards,
read-only behaviour, two-pass persistence/idempotency proof, source-lock contention, lease recovery,
retention, source-configuration preservation and full-verification gates.

**Reason:** Channel implementation status must reflect full operational acceptance rather than a
successful bounded regression, while source facts remain distinct from pricing-impact claims.

## D-029 Source-to-Canonical Event Pipeline

**Status:** Implemented and locally verified.

**Decision:** Collected evidence first enters short-lived `RawArtifact` storage. Parsed source
series and occurrences are persisted in `SourceEvent` and `SourceEventOccurrence`. The application
reads `CanonicalEvent`, `EventOccurrence` and `CanonicalVenue`; explicit link tables preserve source
lineage, match method, confidence and review status. Only exact normalized identity matches are
automatically merged in version 1. `SourceEvent`, `SourceEventOccurrence` and the canonical event
records are the sole supported runtime event model. Impact-qualified occurrences may produce
linked `MarketSignal` records.

**Reason:** Source facts and application facts have different ownership and conflict rules. Keeping
them separate allows additional event providers, safe reprocessing, auditable deduplication and
manual correction without destroying collected evidence or silently changing analytical inputs.

**Verification:** Both event migrations were applied to the local development database. A two-pass
Eventfinda fixture regression verified one source series, two idempotent source occurrences, one
canonical event, two canonical occurrences, one canonical venue and complete source links without
changing Eventfinda configuration. The full database integration suite passed afterward.
The 2026-07-21 bounded real-page acceptance additionally verified 20 frontier targets, two source
series, 120 unique source and canonical occurrences, two venues and complete source links; the
second pass created no new occurrence or link rows and left Eventfinda configuration unchanged.
The nationwide development run then verified all 187 listing pages, 2,821 current discovery
targets and a five-target detail batch that persisted 51 advertised occurrences without failure.
Ticketmaster integration then verified one discovery target and two idempotent detail hydrations into
one source/canonical event, occurrence, venue and complete lineage, plus persistent-challenge backoff.
The local closure then verified Redis lock contention and release, pre/post-expiry job recovery,
negative environment and scheduler guards, 72/168-hour time-advanced retention and the complete
workspace quality gate. The final gate passed 81 TypeScript unit/component tests, 34 browser
runtime/extractor tests and 49 integration tests plus lint, workspace typecheck, the 57-route
Next.js production build and all four Worker entrypoint builds.

## D-030 Source-to-Canonical Market Signal Pipeline

**Status:** Implemented and locally verified across all configured non-event public signal sources.

**Decision:** Non-event public signals first persist in `SourceMarketSignal`. `MarketSignal` is the
canonical application record and `MarketSignalSourceLink` records source lineage, match method and
confidence. Version 1 uses source-isolated identity and does not silently merge signals across
sources. Recollection updates the source record's `lastCollectionRunId` and existing canonical/link
rows instead of creating duplicates.

The generic public-source local path shares development/scheduler/source guards, explicit
source-specific request/record/window/response limits, a Redis per-source lock, 72/168-hour evidence
selection and immutable run counters. Local acceptance skips source health mutations and records
pre/post source-configuration and schedule hashes.

**Reason:** Direct writes to `MarketSignal` did not satisfy source-normalised ownership or explicit
lineage. The new pipeline provides the same audit boundary as canonical events while retaining
conservative matching.

**Verification:** Holidays, GeoNet, MBIE, Stats NZ, MetService, NZTA, RBNZ FX, Queenstown Airport and
Port of Auckland cruise sources completed bounded real passes on 2026-07-21. Database queries and
adapter-specific tests verify deterministic inputs, source/canonical lineage where an analytical
signal is emitted, unchanged source configuration and disabled schedules. A valid zero-alert MetService feed
is a successful observation, while LINZ Gazetteer records remain reference data and intentionally
do not manufacture a market signal. Parser failure uses 168-hour evidence in integration regression.

## D-031 Manual Import Local Acceptance

**Status:** Implemented and automatically verified; real operator-file acceptance is `not_verified`.

**Decision:** Manual import has an explicit development-only `localAcceptance` path capped at one
256 KB file and two valid rows under the shared Redis source lock. It stores only hashed metadata as
short-lived raw evidence, preserves source configuration and schedules, and records duplicate immutable
observations as existing evidence on pass two rather than updating append-only records. The normal
Admin import requires an enabled, operationally available source; local acceptance uses the same
parser and persistence path under development-only bounds.

**Reason:** A fixture can verify parser and persistence mechanics but cannot stand in for an
operator-owned export. Immutable observations also require idempotent
create-if-absent behavior rather than an upsert that attempts an update.

**Verification:** Integration coverage proves environment guards, development scheduler disablement, file and row
bounds, two-pass source/canonical persistence, zero second-pass observations, 72/168-hour evidence,
source-configuration preservation and disabled schedules. A genuine operator file has not been supplied, so
no real-file run IDs or locally verified claim exist.

## D-032 Persistent Browser Identity and Adaptive Challenge Circuit

**Status:** Implemented and locally verified.

**Decision:** Each browser source receives a stable anonymous Profile. The Browser Worker accepts a
bounded `profileKey`, serializes concurrent use of that Profile and saves it only after successful
non-challenge extraction. Profiles are encrypted at rest with AES-256-GCM and atomically replaced.
Tymra adds no custom operating-system or user-agent override and leaves the coherent browser identity
to the pinned Ulixee runtime.

Ticketmaster challenge handling uses a source circuit with 6-hour, 24-hour and 72-hour cooldowns.
The first two expired cooldowns permit exactly one listing-only half-open probe. A successful probe
closes the circuit; a third consecutive challenge requires manual review and never automatically
reopens. Interstitial pages are semantically polled once per second and stop early on resolution or a
terminal block. Automated CAPTCHA solving, proxy rotation, fingerprint spoofing and randomized user
simulation remain prohibited; authenticated operator handoff follows D-042.

**Reason:** Stable successful browser state and sharply bounded recovery probes reduce repeated cold
sessions and unnecessary pressure on a source. Persisting failed state or repeatedly retrying a
challenge would make blocking more likely and provide no data-quality benefit.

**Verification:** Runtime tests prove encrypted Profile round trips without plaintext leakage,
successful-only Profile export, invalid-key rejection and same-Profile concurrency rejection.
Extractor tests prove early semantic resolution and terminal-block detection. Worker unit and
database integration tests prove all three cooldown levels, permanent manual state, one-request
half-open behavior and successful circuit reset.

The all-channel regression additionally disabled Ulixee session keep-alive, made the timeout apply
to the full browser task, hardened Xvfb restart readiness and proved that a normal reCAPTCHA-protected
footer is not an access challenge. Two final RBNZ B1 passes then each persisted two signals with one
request, three success artifacts and no active browser task left behind.

## D-033 Keep The Product Baseline In The Local Project

**Status:** Implemented and verified.

**Decision:** `docs/product` is the only canonical product baseline. No Google Doc, exported hash,
legacy release document or external copy acts as an authority or compatibility source.

**Reason:** A single local system of record keeps product intent versionable beside implementation
and prevents future work from depending on deleted or ambiguous same-named Drive files.

**Verification:** Product README, current requirement precedence and traceability resolve only
repository files.

## D-034 Use Explicit Application Boundaries And Remove Phantom Packages

**Status:** Superseded in part by D-035; `apps/browser-worker` was later removed.

**Decision:** Runnable processes live under `apps/`: `web`, `worker` and `browser-worker`. Shared
runtime code remains under `packages/`. The unused `packages/ui` marker package is removed; the
existing visual system remains implemented by `apps/web/app/globals.css` and Web components.

**Reason:** A symmetrical top-level structure makes runtime ownership visible, avoids mixing one
application with repository orchestration files, and prevents an empty package from implying a
component-library boundary that does not exist. The move deliberately preserves the current homepage
visual and interaction behaviour.

**Verification:** The complete `pnpm verify` gate passed after the move. A production build generated
all 64 static pages and all four Worker entrypoints. Real browser QA at 1440×900 and 390×844 verified
EN/ZH rendering, search input, section navigation, mobile navigation, zero horizontal overflow, no
framework error overlay and no relevant console warning or error.

## D-035 Use Argus As A Durable External Browser Execution Boundary

**Status:** Implemented and locally verified.

**Decision:** Tymra retains ownership of source configuration, schedules, budgets, locks, collection
runs, persistence and canonicalisation. Browser execution for Ticketmaster selective details,
OurAuckland, RBNZ and Lincoln University key dates is submitted to Argus through its asynchronous `/v1/jobs`
contract. `ArgusExecution` persists the remote Job identity and result, a delayed
`ARGUS_JOB_POLL` queue releases the parent Worker lease between polls, and the parent resumes the
same collection run after a terminal result. Tymra first downloads and verifies every referenced
HTML/screenshot into its own evidence volume, updates `RawArtifact` to a local `tymra-evidence:`
reference, and acknowledges the exact result hash only after business records and evidence are
durable. Argus is required in development and production; the private Browser Worker, Ulixee runtime,
fallback packages, Compose services and browser profile volumes are removed.

**Reason:** Browser work can outlive one Worker lease and may need process-restart recovery. A
persisted orchestration boundary prevents duplicate submissions, avoids holding a Worker during
remote execution and keeps remote cancellation subordinate to the local parent Job.

**Verification:** The 2026-07-29 and 2026-07-30 acceptance records cover submit/poll/resume,
idempotent trace identity, restart recovery, result acknowledgement, dry-run boundaries and
cancellation settlement. ARGUS-023 additionally verified persist-before-ACK, exact-hash ACK,
idempotent repeated ACK, Argus result/evidence purge and retained Tymra business records. On
2026-08-01 the migration was applied locally with 33 completed and one cancelled execution and no
active execution; current Argus client/orchestrator unit tests, Worker typecheck and Worker build
passed. The 2026-08-02 Argus-only acceptance then passed the database integration suite, all four
real bounded browser sources, restart recovery, cancellation, evidence copy and remote purge after
ACK. See [`argus-only-cutover-2026-08-02.md`](./evidence/argus-only-cutover-2026-08-02.md).
Lincoln's 2026-08-04 acceptance additionally proved the full connector contract, standardisation,
same-run deferred recovery, local HTML/screenshot retention, remote HTTP 410 after ACK and
second-pass idempotency. See
[`lincoln-key-dates-acceptance-2026-08-04.md`](./evidence/lincoln-key-dates-acceptance-2026-08-04.md).

## D-036 Use Listing-First Collection, Stable Identity And One Shared Public-Source Acceptance Runner

**Status:** Implemented and locally verified; live rerun remains dated evidence.

**Decision:** Every public collector uses the smallest authoritative representation and does not open
a detail page when a list, feed or dataset already contains the normaliser's required fields.
Eventfinda groups canonical URLs and expands all advertised dates from one detail capture.
Ticketmaster persists complete five-city listing records directly and sends only incomplete groups
to its bounded detail frontier. Other public collectors deduplicate references, raw identities and
normalised identities, use a lightweight touch path for unchanged records and expose avoided-request
counters. A single development-only runner derives the current enabled acceptance set from the
Source Registry, executes every selected public source twice inside one fixed window and checks
lineage, configuration preservation, disabled schedules and zero second-pass source/link growth.

**Reason:** Request volume, challenge exposure and duplicate canonical writes are operational risks,
not just performance details. One bounded runner makes the same persistence and idempotency contract
observable across transports without conflating local verification with production activation.

**Verification:** The immutable 2026-07-30 report records 34/34 successful Jobs and CollectionRuns,
zero second-pass source/link growth and no remaining active acceptance execution. On 2026-08-01 the
current runner code, 80 root tests, 37 Worker tests, Worker typecheck and Worker build passed. The
real 17-source runner was not repeated, so current external availability continues to rely on the
dated record.

## D-037 Require A Verified OTA Listing After Address Discovery

**Status:** Superseded for address benchmarks by D-048; retained for target-listing price claims.

**Decision:** A confirmed LINZ address supplies geographic identity and public-signal routing, but
does not prove an accommodation listing, sellable unit or price. Address-first Price Checks must
therefore obtain a supported public OTA listing and validate its stable identity and
location through a durable, read-only Argus Job before any rate Job is queued. Tymra owns strict
connector schemas, conservative address matching, canonical persistence, evidence retention and
the resulting user state. It never substitutes a LINZ identity for an OTA Listing and live mode
never falls back to fixture or manual-import pricing.

**Reason:** One street address can contain multiple businesses or units, while OTA pages may expose
only approximate locations. Separating geographic confirmation from listing confirmation prevents
false matches and fabricated market evidence without giving up nationwide address discovery.

**Verification:** Provider address-match tests and Worker connector tests cover country/city and
coordinate conflicts, insufficient location precision, stable request fields, read-only contracts
and inconsistent price rejection. Production readiness additionally requires the corresponding
Argus connectors and one bounded evidence-copy/ACK cross-service run; automatic scheduling remains
disabled.

## D-038 Model OTA Brands Separately From Source Families

**Status:** Tymra implementation complete; live cross-service acceptance pending.

**Decision:** Tymra actively collects Booking.com, Airbnb, Expedia, Bookabach, Agoda and Trip.com
through one versioned OTA contract. Other OTA brands are outside the current contract and require
no compatibility path. Every Listing stores both the public brand and its provider family.
Booking.com/Agoda share `BOOKING_HOLDINGS`; the other active brands retain their configured family.
Address-driven discovery is bounded to eight
competitor listings, retains each observed brand quote, and maps equivalent property/unit identities
to the same canonical records before analysis so one accommodation is not counted repeatedly.

**Reason:** Brand URLs and public prices can differ even when inventory originates from one platform
family. Keeping both dimensions preserves evidence while preventing duplicated supply from inflating
competitor counts.

**Verification:** URL, provider contract and cross-brand duplicate tests cover the six current providers.
Argus fixture contracts and a final bounded cross-service run remain required before any new source
is described as externally verified. User-triggered jobs remain the only OTA execution path and
automatic scheduling stays disabled.

## D-039 Gate OTA Enablement On Durable Positive Evidence

**Status:** Implemented; source-by-source external acceptance remains required.

**Decision:** OTA health is calculated from durable `CollectionRun`, `ArgusExecution`, `Listing`
and `RateObservation` evidence over a bounded window. The operational report exposes the last
positive result, positive listing and rate counts, empty-result rate, policy-block rate, challenge rate, rate-limit
rate, parser-failure rate and average Argus response time. A source cannot pass the production
release preflight without a positive listing, a positive rate, two bounded runs, a positive result
within seven days, zero parser failures and bounded challenge, rate-limit and empty-result rates.
Configuration-only adapter health never upgrades an OTA source. A previously blocked source stays
blocked until durable evidence and an explicit operator action justify a transition.
Positive listing evidence counts only non-demo listings produced by bounded address discovery, not
a user-submitted target identity. Positive rate evidence counts only non-demo `AVAILABLE`
observations with a complete fee breakdown and a positive total; unavailable, unknown, zero-price
or partial-fee observations remain diagnostic evidence and cannot satisfy the release gate.

**Reason:** A reachable browser process or a schema-valid empty response does not prove that an OTA
can supply a usable market quote. Evidence-derived health prevents placeholder timestamps and
fixture checks from being mistaken for production readiness.

**Verification:** `ota-health.test.ts` covers positive, empty, rate-limited and blocked evidence.
The Worker exposes a read-only `/worker/ota-health` endpoint and `ota:health` CLI command, while
`release:preflight --sources` fails closed when OTA evidence is missing or outside the thresholds.
Automatic scheduling remains disabled in development.

## D-040 Treat Development Collection As Explicit Technical Validation

**Status:** Implemented.

**Decision:** In `NODE_ENV=development`, an explicitly invoked local-acceptance collection may run
even when an internal enablement or production health gate is not satisfied, provided the source's
operational state is not explicitly `BLOCKED` and it declares development support.
Development release preflight does not require production lifecycle or prior positive OTA evidence,
and its two-pass runner attempts every requested source even after an earlier validation failure.
The development CLI does not require the production Canary confirmation phrase. Automatic
scheduling and enabled schedules remain hard blockers. Booking and Expedia use their explicit
public-browser connectors in this profile, so development validation does not depend on Partner
credentials. A source explicitly marked `BLOCKED` remains unavailable, and fixed host/route
validation, source policy, rate/concurrency limits, access challenges and authentication controls
still apply.

**Reason:** Development runs exist to discover integration failures and collect diagnostic evidence;
requiring prior production-grade evidence creates a circular dependency. External access boundaries
are not internal release gates and cannot be converted into a development override.

**Verification:** `release-safety.test.ts` proves evidence-free development preflight and all-pass
execution. `source-schedule-control.test.ts` proves direct validation accepts non-blocked degraded
states while scheduling still requires a healthy source and development scheduling remains disabled.
Direct CLI captures now copy and hash every Argus evidence object before ACK and require the result
endpoint to return 410; dry runs hash evidence in memory before the same purge verification.
The Booking public-browser path has additionally completed a bounded real Wellington discovery and
all-in rate run with Tymra contract validation, evidence hash verification, ACK and 410 purge.
Expedia `/Hotel-Search` remains outside the current public-source workflow and was not opened.

## D-041 Defer Partner OTA API Integrations Until Credentials Are Available

**Status:** Deferred; executable Partner API modules removed.

**Decision:** Tymra currently routes every supported OTA workflow through its public connector.
The Booking Demand API and Expedia Rapid API connector IDs, endpoint routing, wire contracts,
credential-specific request fields, tests and acceptance runner integration have been removed from
the executable codebase because the project has no Partner credentials. This is intentional scope
removal, not a runtime fallback.

For the v1 public-browser contract, a consumer page that explicitly labels its displayed total as
including taxes and mandatory fees may represent that bundled amount as both `basePriceMinor` and
`totalPriceMinor`, with zero normalization components and the mandatory flags
`ALL_IN_TOTAL_INCLUDES_TAXES_AND_FEES` and `PRICE_COMPONENTS_BUNDLED_NOT_ITEMIZED`. This preserves
the observed all-in price without claiming a source-provided fee breakdown. A page without explicit
all-in disclosure cannot produce an available complete rate.

If formal credentials become available, Partner APIs must be restored as a new reviewed change:
reconfirm current provider contracts, isolate credentials in Argus, add explicit connector IDs and
routes, validate identity and price reconciliation, complete bounded real acceptance, and pass the
D-039 production source gate before activation. Historical implementation notes are intentionally
not retained as dead code because external API contracts may change before restoration.

**Reason:** Maintaining unexecutable credential-gated paths increases code and test surface without
providing current capability. A fresh implementation against the then-current official contracts
is safer than preserving dormant integration code.

**Verification:** Provider routing tests require Booking and Expedia to resolve only to their public
connectors. Repository search must find no Partner connector IDs or endpoint hosts in executable
Tymra code. Scheduler remains disabled.

## D-042 Use Short-Lived noVNC Handoff For CAPTCHA

**Status:** Shared Argus session lifecycle and Tymra client contract implemented; Tymra operator UI remains pending.

**Decision:** When an OTA browser execution reaches a CAPTCHA, Argus pauses the exact browser
session and returns `manual_required` with `reason=CAPTCHA`, an opaque `sessionId`, a short-lived
`noVncUrl` under `connect.argus.test`/`connect.argus.nz`, and `expiresAt`. An authenticated operator
may open that link and complete the CAPTCHA manually. Argus then resumes the same execution and
browser profile. A CAPTCHA result without all three session fields violates the connector contract.
Non-CAPTCHA access challenges do not create interactive sessions and continue through the normal
cooldown and circuit-breaker path.

The noVNC handoff is single-purpose and time-limited. It must not expose reusable credentials,
cookies or tokens in application logs, must not be shown on the public customer host, and must close
on success, expiry, cancellation or operator disconnect. Automated CAPTCHA solving, proxy rotation,
fingerprint spoofing and unattended interaction remain prohibited.

**Reason:** A paused-session handoff lets an authorised human complete a legitimate interactive
check without losing the requested dates, occupancy, currency or page state, while keeping Tymra's
collection evidence auditable and avoiding automated challenge bypass.

**Verification:** The Argus client contract test requires a CAPTCHA result to expose and normalise
the noVNC session fields. Cross-service acceptance still requires an expiring Argus session, manual
completion, continuation of the same Job, evidence copy/ACK and confirmation that expired or reused
links are rejected.

## D-043 Derive OTA Market Movement Only From Matched Time-Series Evidence

**Status:** Implemented.

**Decision:** `PRICE_RISING`, `AVAILABILITY_TIGHTENING` and `RESTRICTION_INCREASING`
are internal Tymra signals derived from non-demo, operationally healthy OTA observations. The
current window is the latest 24 hours and the baseline is 24–72 hours before evaluation. A signal
requires at least three listings observed in both windows and at least two OTA providers for the
same market, stay dates, adults and unit count. Price movement additionally requires three complete,
available matched rates, a median increase of at least 5%, and at least NZD 10.00 per night.
Availability and restriction signals require an adverse share movement of at least 20 percentage
points. Signals retain the contributing observation IDs, provider keys, sample size, thresholds and
policy version; they are retracted when the evidence no longer qualifies.

**Reason:** Cross-sectional OTA prices show market position, not movement. Matching the same listing
and stay query across time prevents inventory-mix changes, fee-incomplete prices and single-provider
page behaviour from being presented as a market trend.

**Verification:** Pure policy tests cover all three positive signals and fail-closed behaviour for
insufficient or single-provider samples. Persistence uses stable policy/query identities and the
normal pricing signal selector consumes confirmed signals only.

## D-044 Route Argus Public Market Facts Through Source-Isolated Lineage

**Status:** Implemented; production schedules remain disabled pending operational activation.

**Decision:** Tymra integrates the accepted Argus official-venue, cruise, live-airport and university
contracts as 20 distinct public sources. Venue and university records enter the canonical event
pipeline. Cruise calls and airport board rows enter the source-isolated `TRANSPORT_FLOW` pipeline.
Official venue capacity is retained on `CanonicalVenue` but is never event attendance. Vessel
maximum capacity remains separate from actual passenger count, and airport rows never infer aircraft
capacity, passenger count or load factor. Every browser result is schema-validated, its evidence is
copied and hash-verified, and the exact result hash is acknowledged before Argus purge.

The following remain explicit coverage gaps rather than implemented sources: Auckland Airport live,
Tauranga Airport, Nelson Airport, Invercargill Airport, Napier cruise and Bay of Islands cruise are
public but not yet machine-stable; Whangārei Airport and Bluebridge do not expose a stable complete
public record. No proxy source or same-group brand evidence substitutes for them.

**Reason:** Public schedules and calendars add useful local demand context only when identity,
timestamps, source ownership and non-inference boundaries remain auditable through the full pipeline.

**Verification:** Contract and normalisation tests cover identity/count consistency, impact evidence,
capacity separation and passenger non-inference. The public acceptance runner includes every new
source, requires the expected one or two Argus executions, retained local evidence, zero remote
evidence references after ACK, and canonical source lineage on both passes.

## D-045 Use Pacific/Auckland For Every Business Calendar Date

**Status:** Implemented.

**Decision:** Tymra derives, compares and displays accommodation stay dates, query-plan dates,
source date ranges, daily collection boundaries and date-only public events in
`Pacific/Auckland`. Date-only database values continue to use a UTC-midnight storage sentinel, but
their calendar label is interpreted as a New Zealand date. Timestamped observations, evidence and
security expiries remain absolute UTC instants. Rolling 24/72-hour freshness, retention and abuse
windows remain elapsed durations rather than calendar-day calculations.

New Zealand local-day boundaries are calculated with IANA timezone rules instead of a fixed
`+12:00` offset, so both NZST and NZDT transitions are preserved. A date-only event ends one
millisecond before the next New Zealand local midnight, including 23-hour and 25-hour days.

**Reason:** UTC date truncation can select the previous New Zealand business day during the local
morning, and a fixed offset fails during daylight saving. Mixing those meanings can shift the
formal 30-day horizon, OTA request dates and event overlap by one day.

**Verification:** Domain tests cover the UTC/New Zealand midnight boundary, year rollover, the
23-hour September transition and the 25-hour April transition. Web, worker and public-event tests
cover default stay dates, OTA grouping, early-morning event overlap and date-only Argus events.

## D-046 Organise Membership Code By Feature Boundary

**Status:** Implemented.

**Decision:** Authenticated customer components live in `apps/web/components/member`; operator-only
membership components live in `apps/web/components/admin/membership`; membership authentication,
entitlement, quota, risk and billing services live in `apps/web/lib/server/membership`; and member
scheduling lives in `apps/worker/src/membership`. Anonymous funnel components remain in
`components/public`. This is an ownership and dependency change only; routes, persisted contracts
and product behaviour are unchanged.

Numbered source copies are not accepted as variants. The first behaviour-preserving large-file split
is recorded in `architecture/codebase.md`; deeper source-family or Worker decomposition still requires
an independently reviewed change after boundary tests exist. Generated output and dated evidence are
not source modules.

**Reason:** Membership capability had grown across public UI, generic server helpers and Worker root,
making ownership unclear and documentation drift easier. Feature boundaries make customer/Admin
isolation, review scope and future decomposition explicit without coupling a structural cleanup to
business refactoring.

**Verification:** Repository searches reject the former import paths and numbered source copies;
lint, TypeScript, unit/integration tests and production build verify the moved module graph.

## D-047 Fail Closed At Independent Membership Launch Gates

**Status:** Implemented locally; production provider acceptance remains external.

**Decision:** Paid plan visibility does not implicitly launch every advanced capability. CSV export
and the Portfolio read API require verified email, a serviceable membership, plan entitlement,
independent quota/idempotency and their own server-side launch flags. Export cannot launch before
Pro; the read API cannot launch before Portfolio. Production managed challenges require an HTTPS
verification endpoint plus a server-side secret and treat missing, rejected or unavailable provider
responses as denial. A dedicated live-member Playwright gate accepts only non-demo observed OTA
prices and is never replaced by the fixture suite.

**Reason:** UI-only gates and successful fixture runs can otherwise expose unfinished paid features
or misstate cross-service readiness. Independent fail-closed controls allow code to ship safely while
credentials, provider capacity, production monitoring and commercial approval remain pending.

**Verification:** Configuration tests enforce gate dependencies and managed-challenge production
requirements; server/integration tests cover authenticated provider verification, Stripe lifecycle,
quota and retention; `test:e2e:member-live` is the explicit external acceptance command.

## D-048 Support Listing Pricing And Address Benchmarks As Separate Analysis Modes

**Status:** Implemented locally; live address-benchmark provider acceptance remains external.

**Decision:** Tymra accepts two explicit member Price Check modes. `LISTING_PRICING` verifies a
supported target OTA Listing and returns target-property prices. `LOCATION_BENCHMARK` verifies a
real New Zealand address, searches supported OTA sources around that spatial anchor and returns
every valid nearby public price as a neighbourhood benchmark without requiring or inventing a
target Listing. One valid price applicable to either mode makes the price result successful;
comparable or market-signal weakness affects only the recommendation. An address and any supported
OTA links resolved to the same physical Property share one property slot.

This decision supersedes D-037's requirement that every address-first check acquire a target OTA
Listing. D-037 remains the historical Listing-first safety rationale and continues to apply whenever
Tymra claims a price belongs to the member's own accommodation.

**Reason:** Some members want a target-listing price comparison, while others only need evidence of
what nearby accommodation is publicly charging. Treating the second case as a first-class benchmark
preserves useful evidence without falsely attributing a nearby rate to the submitted address.

**Verification:** Domain, API and membership integration tests distinguish the two analysis modes,
enforce stable physical-Property quota identity, return a single valid applicable observation and
keep recommendation status independent. Public EN/ZH browser checks verify separate OTA-link and
address entry points. Production launch still requires a bounded real-provider address-benchmark run.

## D-049 Treat The Accommodation Data Core As The Asset And Product Surfaces As Outputs

**Status:** Product-approved strategy; no additional product surface is approved by this decision.

**Decision:** Tymra's current strategic core is New Zealand accommodation market intelligence, not
an unbounded general-purpose New Zealand data warehouse. The system continuously accumulates
versioned and comparable evidence about accommodation identity, public prices, availability,
demand signals and change over time. The member experience is the first commercial surface over
that core. Future group, tourism-market, accommodation-investment, event-impact or API/data-service
surfaces may reuse the same core only after their users, contracts, launch gates and
commercial promises are independently approved.

The core asset must preserve a unified Source Registry, explicit source/effective/collection/ingest
time semantics, raw/normalised/derived layers, Confidence and Freshness, address-to-OTA identity,
Listing change history and end-to-end Data Lineage. Short-lived Argus evidence may still be purged
after verified ACK; durable lineage relies on permitted normalised facts, source identifiers,
timestamps, quality state and hashes rather than indefinite retention of browser material.

**Reason:** Pages and individual workflows can be reproduced. Long-running national coverage,
stable accommodation identity, historical depth, calibrated quality and auditable provenance are
the compounding assets that make later analysis and additional products defensible.

**Verification:** This decision clarifies strategy and data-governance requirements only. Current
implementation status remains governed by `docs/traceability.md`; each future surface requires its
own approved requirements and acceptance evidence before it may be described as available.

## D-050 Deploy The Nationwide Data Core And Hidden Client Surface Together

**Status:** Product-approved current baseline; documentation updated, implementation gap audit
required.

**Decision:** New Zealand nationwide accommodation data collection is current scope now.
Christchurch remains an early real-acceptance and regression market but is not a product, scheduler
or data-coverage boundary. Nationwide coverage means five explicit layers: the national
Property/Unit/Listing identity directory, national public market signals, a stratified
representative OTA price/availability panel, bounded on-demand collection for any reliably resolved
New Zealand address or supported OTA URL, and plan-aware daily monitoring for activated
member properties. It does not mean recollecting every listing, OTA and future day combination.

The same production version deploys the internal collection backend, Worker, scheduler, source
health, exceptions, coverage and data-asset operations together with public Price Check, customer
sign-in, membership, plan pricing, Stripe billing and customer results. Client discovery initially
uses `DEPLOYED_HIDDEN`: homepage, public navigation and marketing CTA entries are hidden, while the
routes, APIs, Worker paths, database and webhooks remain deployed and must pass production gates.
Hidden discovery never substitutes for authentication, authorization or entitlement checks.

The Source Registry remains an operational registry of source identity, data domain, capabilities,
lifecycle, enablement, health, schedule, concurrency/budget, retention and ownership. Sources use
capability-based contracts rather than a universal OTA method set.

Price facts and recommendations remain separate. One valid, attributable and query-compatible
public price produces a successful price result; weak comparable or market-signal evidence limits
only the recommendation. Address snapshots may have no target Listing and must not fabricate one.

**Reason:** A Christchurch-only dataset cannot compound into a defensible national accommodation
market asset. One production artifact prevents the hidden client surface and data core from drifting
into separate architectures while allowing Tymra to delay public discovery during early data
accumulation.

**Verification:** `docs/product/data-core.md` defines `DATA-CORE-001..022`. The current codebase must
be audited against those clauses before the backend is called nationwide-production-ready.
Customer-browser, membership and Stripe paths require production acceptance even while their entry
points remain hidden.
