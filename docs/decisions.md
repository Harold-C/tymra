# Tymra Product And Technical Decisions

Last reviewed: 2026-10-07

This file records durable choices and their rationale. Product details remain authoritative in
[product](product/README.md); implementation, verification and release state belong in
[traceability](traceability.md). Historical choices do not create compatibility requirements or
authorize new operations. Decision IDs remain stable references to the choices, including superseded ones.

## D-001 Preserve The Existing Root Web Application (Superseded)

**Superseded by D-034.** The early root-level Web layout was replaced by explicit application
directories. It creates no current runtime or migration requirement.

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

**Decision:** Deterministic demo/fixture providers are limited to development/test. Manual import
uses validated source data and permits publication only when its source and quality gates pass.
Production must never substitute generated data for failed live collection.

**Reason:** Repeatable development data and genuine observations must remain distinguishable.

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

## D-010 Local Domain And Service Lifetime

**Decision:** Docker Compose defines the reproducible full-stack environment and shared Traefik
ingress. Check actual image, mounts, Compose identity and database before runtime work.
Do not run duplicate host and container Web/Worker processes.

**Reason:** One selected runtime avoids duplicate jobs and conflicting processes. Host debugging
uses explicit commands from the root README; the unused LaunchAgent templates and automatic
recovery scripts were retired on 2026-10-07.

## D-013 Result Version Lifecycle

**Decision:** Published result content is immutable. A published version may only transition to
`SUPERSEDED` or `WITHDRAWN`; lower-confidence and partial operator actions create a replacement
version, clone its insights with an audit limitation, publish it and supersede the old version.

**Reason:** This preserves the evidence used for every historical result while supporting the
required operational correction workflow.

## D-014 Build And Runtime Separation

**Decision:** Production builds use `.next-build`, while the selected development server keeps
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

**Decision:** Replace the email-first public flow with two stages: an anonymous low-cost rough result,
followed by email verification and an authenticated formal Price Check. The rough result must provide
real value while reserving exact dates, detailed comparable evidence and formal actions for the
authenticated report.

**Reason:** Asking for identity before demonstrating value weakens conversion, while running full
provider collection anonymously creates uncontrolled cost and abuse exposure.

## D-016 Customer Identity Is Separate From Admin

**Decision:** Customer accounts, password sign-in, sessions and guards remain separate from
administrator identities. Purpose-bound Price Check verification may create or resume a customer;
independent registration creates an unverified Free account. Neither grants Admin access.

**Reason:** Customer authentication and automatic account creation must never elevate operational
authority. Authentication details are defined by [customer-funnel.md](product/customer-funnel.md).

## D-017 Verify Anonymous Unlock Before Account Activation

**Decision:** In the anonymous Price Check flow, email submission creates a pending verification
request; successful single-use consumption creates or resumes the customer, binds the check,
creates a session and enqueues formal work idempotently. Independent password registration is a
separate flow and cannot start provider work until email verification.

**Reason:** Verification is the boundary for account ownership transfer and costly collection;
registration without a check must remain possible.

## D-018 Verify Before Formal Provider Cost

**Decision:** Anonymous rough analysis uses validated cached or aggregate evidence. Formal provider
collection is enqueued only after email verification or by an already authenticated eligible
customer.

**Reason:** Verification is the cost boundary that prevents random addresses and email bombing from
consuming provider, Worker and storage resources.

## D-019 Authenticated Formal Reports

**Decision:** Formal reports are protected by customer sessions and server-side ownership checks.
Durable bearer result tokens are not a supported customer access model; public sharing is deferred.
No legacy result-link compatibility path is required.

**Reason:** Session-owned reports provide revocation, history and cross-account isolation without
placing durable report authority in a URL.

## D-020 Minimal Conditional Email

**Decision:** A normal flow sends one `VERIFY_AND_SIGN_IN` email. Publication starts a configurable
two-minute notification grace period. The authenticated page records an idempotent acknowledgement
only after the terminal result renders; the terminal email is sent when that acknowledgement is
absent at the end of the grace period. Partial, insufficient and failed terminal emails replace
`RESULT_READY`. `CHECK_RECEIVED`, in-page `CONFIRMATION_REQUIRED` and immediate
`CHECK_PROCESSING` are not part of the current happy path.

**Reason:** Conditional delivery reduces noise and avoids sending messages that repeat the page the
customer is already using.

## D-021 Layered Abuse And Quota Controls

**Decision:** Apply configurable device, IP, email, Property, account and Benefit Group controls
with allow, challenge and cooldown/reject outcomes. Device identity is a first-party random cookie,
not invasive fingerprinting. IP alone cannot justify blocking. Quotas, claim uniqueness, payment
HMAC subjects and retention follow [membership](product/membership-plans.md) and
[funnel](product/customer-funnel.md) contracts.

**Reason:** Shared networks and duplicate identities require independent signals; a second table of
quotas in this decision log would drift from the commercial contract.

## D-022 No Exclusive Property Claim

**Decision:** Customers own Price Checks and reports, not the public property identity. Multiple
customers may analyse the same property. PMS ownership verification, teams and organisation roles are
deferred.

**Reason:** Exclusive claims require stronger business verification and support processes that are
outside the current product scope.

## D-023 Separate Retention By Data Purpose

**Decision:** Retention separates anonymous/verification/security data, member report history,
billing obligations and raw browser evidence. Exact periods and remaining approval gates are owned
by [customer-funnel.md](product/customer-funnel.md), [membership-plans.md](product/membership-plans.md)
and [data-core.md](product/data-core.md). Customer plan history cannot extend raw evidence retention.

**Reason:** Different data purposes need different lifecycles; one blanket retention period is unsafe.

## D-024 Real-State Motion

**Decision:** The rough-result experience may use expressive motion, but each progress stage maps to a
real server state or completed subtask. Ready results are not artificially delayed, reduced motion is
complete, and animation failure cannot block the result.

**Reason:** The desired experience should feel sophisticated without misrepresenting work or reducing
accessibility and reliability.

## D-025 Supported OTA Link Or New Zealand Address With Explicit Target Mode

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

**Decision:** Formal analysis uses Property, SellableUnit and Listing identities, immutable
observations and versioned snapshots/results. PostgreSQL is durable; Redis coordinates.
The active six OTA sources use Argus public connectors. Demo/fixture execution is limited to
development/test. Missing or blocked live evidence produces an honest unavailable result.

Optional public-signal failure is recorded separately and does not imply unavailable accommodation.
One valid query-compatible price remains deliverable even if recommendation evidence is insufficient.

**Reason:** Source capability, observed price and analytical confidence are distinct facts.

## D-027 Domain And Runtime Trust Boundaries

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

The shared host Traefik and external `local` network define local ingress. Production hostnames are supplied through `HOST_PUBLIC`, `HOST_OPS`, `HOST_WWW`
and origin variables rather than embedded throughout application code. Production secrets and
runtime switches use a separate `PROD_*` namespace so the local `.env` cannot silently select demo
providers or reuse development credentials in a deployment.

**Reason:** Stable host semantics make development representative of production while keeping
customer identity, administrator authority, internal processing and diagnostic tooling in distinct
trust boundaries. Same-origin customer APIs avoid unnecessary CORS and parent-domain Cookie risk.

## D-028 Browser Event Collection Before Scheduling

**Decision:** Eventfinda and Ticketmaster use read-only Argus listing/detail workflows, without a
Tymra browser runtime or Ticketmaster API. Development scheduling is disabled. Each source requires
bounded persistence, idempotency, locks, lease recovery, evidence and unchanged configuration checks
under [collection acceptance](collection/acceptance.md).

Listing evidence is used directly when complete; necessary detail work is bounded and deferred.
Challenges stop through the source circuit. Bounded trials do not prove unattended stability,
complete coverage or event-driven accommodation demand.

**Reason:** Source implementation, production enablement and sustained operation are separate gates.

## D-029 Source-to-Canonical Event Pipeline

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

## D-030 Source-to-Canonical Market Signal Pipeline

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

## D-031 Manual Import Local Acceptance

**Decision:** Manual import has an explicit development-only `localAcceptance` path capped at one
256 KB file and two valid rows under the shared Redis source lock. It stores only hashed metadata as
short-lived raw evidence, preserves source configuration and schedules, and records duplicate immutable
observations as existing evidence on pass two rather than updating append-only records. The normal
Admin import requires an enabled, operationally available source; local acceptance uses the same
parser and persistence path under development-only bounds.

**Reason:** A fixture can verify parser and persistence mechanics but cannot stand in for an
operator-owned export. Immutable observations also require idempotent
create-if-absent behavior rather than an upsert that attempts an update.

## D-032 Persistent Browser Identity and Adaptive Challenge Circuit

**Decision:** Argus owns persistent browser identity, profile encryption, execution mode and
same-profile concurrency. Tymra owns source health, budgets and the challenge circuit; it does not
implement profile storage or a private browser fallback.

Ticketmaster challenges use 6/24/72-hour cooldowns. After the first two cooldowns one listing-only
half-open probe may close the circuit; the third consecutive challenge requires manual review.
Passive interstitial observation is bounded. Automated CAPTCHA solving, proxy rotation,
fingerprint spoofing and fabricated human activity are prohibited. Approved CAPTCHA handoff follows D-042.

**Reason:** Stable browser state and bounded recovery avoid repeated cold sessions while keeping
execution ownership in the shared platform.

## D-033 Keep The Product Baseline In The Local Project

**Decision:** `docs/product` is the only canonical product baseline. No Google Doc, exported hash,
legacy release document or external copy acts as an authority or compatibility source.

**Reason:** A single local system of record keeps product intent versionable beside implementation
and prevents future work from depending on deleted or ambiguous same-named Drive files.

## D-034 Use Explicit Application Boundaries And Remove Phantom Packages

**Decision:** Runnable applications are `apps/web` and `apps/worker`; shared code is in
`packages/*`. Web UI remains with its consumer rather than an empty marker-only UI package.
Dependencies flow from applications to shared packages.

**History:** This replaced D-001's root Web layout. The temporary `apps/browser-worker` boundary
was removed by D-035; it is not a supported application or fallback.

**Reason:** Directory ownership should represent actual runtime and dependency boundaries.

## D-035 Use Argus As A Durable External Browser Execution Boundary

**Decision:** Tymra retains ownership of source configuration, schedules, budgets, locks, collection
runs, persistence and canonicalisation. Browser execution for Eventfinda listings/details,
Ticketmaster listings/selective details, OurAuckland, RBNZ and Lincoln University key dates is
submitted to Argus through its asynchronous `/v1/jobs` contract. `ArgusExecution` persists the
remote Job identity and result, a delayed
`ARGUS_JOB_POLL` queue releases the parent Worker lease between polls, and the parent resumes the
same collection run after a terminal result. Tymra first downloads and verifies every referenced
HTML/screenshot into its own evidence volume, updates `RawArtifact` to a local `tymra-evidence:`
reference, and acknowledges the exact result hash only after business records and evidence are
durable. Argus is required in development and production; the private Browser Worker, Ulixee runtime,
fallback packages, Compose services and browser profile volumes are removed.

**Reason:** Browser work can outlive one Worker lease and may need process-restart recovery. A
persisted orchestration boundary prevents duplicate submissions, avoids holding a Worker during
remote execution and keeps remote cancellation subordinate to the local parent Job.

## D-036 Use Listing-First Collection, Stable Identity And One Shared Public-Source Acceptance Runner

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

## D-037 Require A Verified OTA Listing After Address Discovery

**Partly superseded by D-048.** A claim about a target property's own price requires a verified
supported Listing and physical-unit/query match. An address alone does not prove that identity.
Address benchmarks instead preserve a spatial anchor and attribute nearby rates to their actual
Listings; they do not need or fabricate a target Listing.

**Reason:** This retains the identity safety rule without forcing the retired listing-only flow onto
the approved address-benchmark mode.

## D-038 Model OTA Brands Separately From Source Families

**Decision:** The active contract covers Booking.com, Airbnb, Expedia, Bookabach, Agoda and Trip.com.
Each Listing retains public brand and provider family. Equivalent physical Property/Unit identities
are deduplicated before comparison without discarding distinct observed brand quotes.
Other OTA brands have no current compatibility requirement.

**Reason:** Brand and inventory family are not interchangeable; repeated inventory must not inflate
the market sample. Production enablement is independently source-scoped under D-039.

## D-039 Gate OTA Enablement On Durable Positive Evidence

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

**Version-bound reacceptance (introduced 2026-10-05):** The default remains the rolling 30-day window. An operator may
freeze a source-specific boundary at the first exact bounded job of the repaired version using
`ota:production:acceptance-window`; the boundary records that job, its creation time, both source
revisions and authorisation time. Existing boundaries cannot be moved or overwritten to exclude
later failures. The effective window is the later of that boundary and the rolling cutoff.
All runs, executions, artifacts and failure flags remain unchanged; `ota:health` exposes the
original rolling-window metrics separately as `historicalMetrics`. Source health, activation and
release preflight use the same effective window. All thresholds above remain; automatic OTA
enablement additionally requires the latest two exact complete successful parents inside this
window, positive complete future rates and retained evidence with verified delivery/ACK.

**Successive repaired versions (introduced 2026-10-06):** A separately confirmed
`ota:production:acceptance-version` action may append a window for changed Tymra/Argus revisions
at that version's first exact bounded parent, naming the previous frozen starting job.
`productionOtaRepairAcceptance` is retained unchanged; later windows are kept in the ordered
`productionOtaRepairAcceptanceVersions` array. Each version must link to its predecessor,
start after it, and use a revision pair not previously accepted. The latest linked window
is used consistently for health, activation and preflight; all older windows, failures and
rolling 30-day metrics remain. No window is moved automatically, and the original freeze
command still rejects an overwrite. Zero parser failures and two recent exact complete parents,
durable local evidence and verified delivery/ACK remain mandatory.

Unchanged detail identities may be reused by a fresh bounded discovery without changing their
original observation time. Positive listing evidence also accepts an identity confirmed within
seven days whose `productionOtaJobId` matches a completed positive national discovery run in the
effective window. Failed, empty, incomplete or out-of-window runs and unassociated or expired
identities cannot satisfy this path. Health and production enablement use the same source-scoped,
non-demo query; original identity timestamps and historical metrics are retained.

## D-040 Treat Development Collection As Explicit Technical Validation

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

## D-041 Defer Partner OTA API Integrations Until Credentials Are Available

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

## D-042 Use Short-Lived noVNC Handoff For CAPTCHA

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

## D-043 Derive OTA Market Movement Only From Matched Time-Series Evidence

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

## D-044 Route Argus Public Market Facts Through Source-Isolated Lineage

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

## D-045 Use Pacific/Auckland For Every Business Calendar Date

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

## D-046 Organise Membership Code By Feature Boundary

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

## D-047 Fail Closed At Independent Membership Launch Gates

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

## D-048 Support Listing Pricing And Address Benchmarks As Separate Analysis Modes

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

## D-049 Treat The Accommodation Data Core As The Asset And Product Surfaces As Outputs

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

## D-050 Deploy The Nationwide Data Core And Hidden Client Surface Together

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

## D-051 Keep The Initial Production Ingress Admin-Only

**Decision:** The first production ingress exposes only `ops.tymra.nz` for administrator sign-in,
authenticated Admin pages and Admin APIs. `tymra.nz` and `www.tymra.nz` have no production Web routers.
The Web application also denies non-Admin pages and APIs in production unless a later, explicit
access-mode change is made. Admin responses carry `X-Robots-Tag: noindex, nofollow, noarchive`;
access control is provided by ingress and application routing, not by search directives.
This operational stage does not redefine `DEPLOYED_HIDDEN` or certify the client product.

**Reason:** The first deployment is for private backend operation. A hidden navigation link alone
still leaves direct customer URLs available to anyone who knows them.

## D-052 Isolate Verification And Give Modules Explicit Owners

**Decision:** Database tests require explicit disposable local targets and reject missing or unsafe
configuration before fixture setup. Browser verification owns a standalone Compose project, network,
ports and disposable data volume, with synthetic credentials and external services disabled.
CI runs workspace verification and browser flows independently; production-shaped build verification
uses synthetic disabled-service configuration rather than deployment credentials.

Worker service entrypoints delegate to typed modules for requests, pricing, catalog, operations,
source collection and persistence. Job dispatch delegates to dedicated handlers. A shared schedule
policy reuses exact approved shape validators and source-approval rules; it does not widen collection
bounds or replace source-specific activation controls.

Providers expose named contract/adapter subpaths, without a root export-all or compatibility barrel.
Homepage state, member features and Admin queries have separate owners. Shared TypeScript settings
contain no Next.js plugin or Web aliases; static checks cover all workspaces and enforce client/server
and application/package dependency boundaries. Styles load from their owning route layouts, while
public responsiveness and reduced motion remain global.

**Reason:** Routine tests must not reset development data or contact real services. Explicit owners
reduce coupled imports and large mixed-purpose files while preserving business contracts, query
filters, retry/lease behavior and evidence-before-ACK guarantees.

## 文档与运行阶段变迁

本节只记录影响后续判断的变迁。删除仓库文件的完整旧内容可在 Git 提交
`4146a415137c50cec66398c61f651e7a0b6b48b5` 中按原路径查看；不用旧页、别名页或兼容副本
恢复旧流程。生产原始失败记录、业务数据、配对备份及来源原件未由文档清理删除。

| 时段 | 变迁及仍有效的边界 |
| --- | --- |
| 2026-07 至 08-02 | Root Web 迁入 apps/web；私有 Browser Worker 被 Argus 外部执行替代。建立 canonical event/signal、durable polling、证据 copy/hash/ACK。当前职责见 collection/argus.md |
| 2026-08-03 至 08-09 | 曾采用 Eventfinda/Ticketmaster HTTP 与混合详情方案；公共来源扩展至主要市场及 Sporty/Ticketek。随后浏览器来源回归 Argus；旧传输步骤不再适用。事件事实不等于需求影响 |
| 2026-08-10 至 08-21 | 四档会员、独立密码登录、双目标模式与全国数据核心成为当前产品合同。旧 bearer 结果、仅 OTA 输入和强制目标 Listing 的地址流程退休；2026-08-12 Sandbox 只证明测试支付。OTA soak 的人工豁免不证明自然长时周期 |
| 2026-09-13 至 09-14 | 工程迁入 Development；iCloud 仅作导航/原始资料。旧目录、运行快照及备份恢复由 Life 既有恢复入口管理，不把迁移时镜像/分支/LaunchAgent 状态写成长期事实 |
| 2026-09-24 | Admin-only 生产接入。首次 Lincoln 尝试因 UNIVERSITY_CALENDAR 持久枚举缺失及 Cloudflare HTML 改写而回滚；修复 enum 与 no-transform 交付后复用原 Argus Job，业务入库、证据及 ACK/410 通过，原失败保留 |
| 2026-09-25 至 09-29 | 首批两条、再五条公开计划扩展至 78 条有界公开计划；补充增量、时间、历史版本及 list-first 采集。旧五来源评估器只适用于其固定基线，不能套用到当前 84 条计划。隐藏入口开发检查未开放生产客户站点 |
| 2026-10-04 至 10-06 | 六 OTA 分来源试采、修复、固定验收窗口并启用；七公开来源完成预算/排队/查询/筛选恢复。Airbnb 总价与 Bookabach 后缀修复后重新验收，最新 84 条计划开启；恢复后的自然周期仍需核查 |
| 2026-10-06 文档整理 | 状态集中到 traceability，下一步集中到 implementation-plan；稳定合同与运行快照分离。删除下列重复交接、冻结候选与阶段准备页，保留独立验收证据、来源原件和代码实际使用的基线 |
| 2026-10-07 文件清理 | 删除未安装的旧本机自启/恢复入口、其 E2E 锁标记机制及已无页面的 bearer 结果目录；清理未被当前进程或容器使用的构建与依赖残留。保留有效源码、依赖、数据库迁移、验收与采集原始证据、凭证和恢复材料 |
| 2026-10-07 结构优化 | Worker 与 Job handler 按职责拆分，调度分类/来源批准集中到 schedule-policy；provider 改显式子路径；首页、会员功能和后台查询分别归属。独立测试栈替代重建日常开发服务，测试入口增加 fail-closed 守卫；共享 TS、全工作区检查与 CI 浏览器步骤落地。旧 bearer/status 测试改为现行账户报告权限、终态隐藏及最新版本合同，不保留旧入口适配 |

删除记录（路径相对仓库）：

- `docs/collection/argus-responsibilities.md`、`docs/collection/argus-priority-source-prompt.md`：
  当前职责并入 Argus 主合同及对应来源合同；旧待办与交接命令失效。
- `docs/argus-live-ota-readiness-2026-08-13.md`：冻结旧镜像的续跑说明退休；
  其 2026-08-13 开发 Agoda 报告仅有部分费用的 NZD 309 nightly 观察，不证明完整总价或生产就绪。
- `docs/evidence/non-ota-collection-task-archive-2026-08-05.md`：重复的任务交接归入本变迁记录。
  当时 School Sport 两来源及 Ticketek 完成两轮本地持久化/ACK，第二轮无新增；不代表现行来源可用性。
- `docs/evidence/full-production-gates-preparation-2026-09-25.md`：隔离候选和隐藏入口证据摘要保留在追踪表；旧“下一步部署”清单已被当前计划取代。
- `docs/evidence/first-five-cycle-review-preparation-2026-09-25.md`：
  保留机器基线及只读工具的适用范围在 collection/acceptance.md，不继续维护待运行状态。
- `docs/evidence/first-public-scheduled-collection-2026-09-25.md`、
  `docs/evidence/first-five-public-scheduled-collection-2026-09-25.md`：
  首批启用阶段已被后续公开来源发布验收和当前追踪取代。
- `docs/evidence/tymra-argus-production-attempt-2026-09-24.md`、
  `docs/evidence/tymra-argus-production-recheck-2026-09-25.md`：
  失败根因、恢复边界与后续验收集中到上表及保留的 2026-09-24 正式验收记录。
- iCloud `sources/history-index.md`：原任务/图片登记由 `sources/README.md` 直接引用两个原始登记 JSON，
  删除重复 ID 表和过时的运行/备份现状描述；不删除原登记或图片。
- `ops/launchd/`、`scripts/ensure-local-dev.sh`、`scripts/run-local-web.sh`：三个 LaunchAgent
  均未安装或加载，现行服务使用独立容器；删除重复启动及自动恢复入口。E2E 中仅用于暂停旧恢复脚本的
  `e2e-runtime.lock` 写入/删除同步移除，不改变测试的环境重建和恢复流程。
- `apps/web/app/[locale]/result/[token]/`：只剩无子页面的 layout，构建路由中已无此入口；
  现行结果由已登录客户在账户内访问，不保留旧 bearer 路由外壳。
- 本机工程父目录 `history/legacy-local-launchers/` 及其说明页：删除 2026-09-14 迁入、仍指向
  旧 `Documents/project/nbc-tymra` 的两份辅助脚本；路径迁移及退役事实保留在本节。
- 本机 `migration-cache-pnpm-interrupted-2026-09-13/`、仓库
  `output/local-cache-backup-20260821/`、闲置 `.next` / `.next-build` / Worker `dist`、
  TypeScript 增量缓存、五份带数字后缀的旧 E2E 锁、一份相同内容的测试状态副本及空目录：
  属于可重建产物、重复文件或空壳，清除前已核对引用、符号链接、打开文件及容器挂载。
  实际依赖安装、原始测试报告、soak checkpoint / Argus 证据和受保护 runtime 目录保留。
