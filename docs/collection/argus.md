# Argus browser collection boundary

Last updated: 2026-10-06 (bounded public queue wait and execution deadlines)

## Bounded OTA production pilots

The six approved sources are `booking`, `airbnb`, `expedia`, `bookabach`, `agoda`, and `trip`.
`ota:production:prepare --source <key> --confirm BOUNDED_PRODUCTION_OTA` creates only the named
non-demo source, four public capabilities and one disabled daily plan. It never overwrites existing
sources and does not require disabling the existing public-source schedules.
`ota:production:trial` uses the same arguments to explicitly rearm and queue one source; only one
Tymra OTA Job can be active. Each Job allows one regional listing discovery, at most one necessary
detail and one exact-unit future-stay price. New submissions share a lock, allow at most three
executions per Job and six per source per New Zealand day, and keep the shared Argus concurrency unchanged.
Waiting for Argus preserves the same run and query; failures suspend only this source and its plan.
An explicitly authorized manual trial can temporarily waive only the six-per-day submission budget.
Its source metadata must contain `productionOtaDiagnosticBudgetWaiver` with version
`ota-manual-diagnostics-v1`, `authorizedAt` and `expiresAt`; the window cannot exceed 24 hours.
The waiver applies only to `ota-trial:` Jobs while the window is active. Daily counters still include
every execution. Normal schedules, per-Job bounds, single-source concurrency, source pacing,
challenge handling and complete evidence/price activation gates retain their usual controls.
Removing the metadata or reaching expiry restores the daily limit without a service restart.
An access challenge cancels only the bounded pilot's own Argus Job and waits for its terminal
cancellation to release shared browser capacity; customer/manual workflows retain their existing handling.

List identities are reused when complete; unresolved/search-summary identities require details.
Unchanged discovery identity with retained resolution is reused for seven days; changed identity or
expired resolution requires another bounded detail. Search occupancy is not physical-unit capacity.
The rate request carries optional `unitExternalId`; results must match provider, listing, physical
unit, dates, NZD and occupancy. Available positive all-in totals require either explicit components
or `totalIncludesMandatoryFees=true` with `fieldSources.totalIncludesMandatoryFees` evidence.
Bookabach property and physical-unit identities retain an observed `vb` or `ha` suffix;
the bare property ID and each suffixed ID are distinct, including in canonical URLs.
Unknown breakdown components remain nullable in observation context; existing integer accounting
columns are not evidence that an unpublished fee equals zero. Each new run appends a price observation;
replaying the same run is idempotent.

`ota:production:enable` requires the latest two exact, single-attempt successful Jobs within seven
days, positive physical-unit discovery and complete available price in each, retained evidence and
verified Argus ACK/purge. D-039 rolling health thresholds also apply. Plans are daily and staggered
by source outside office hours. `ota:production:pause` disables only the named OTA plan/source.
All four mutation commands require production and the explicit confirmation string above.
The generic public canary/preflight and source-wide public schedule commands are not OTA controls.
Implementation and actual production acceptance are recorded separately in `docs/traceability.md`.

Argus provides Tymra's authenticated, read-only browser execution boundary. Tymra uses its asynchronous
Job API for Ticketmaster and Eventfinda listings/details, RBNZ B1, OurAuckland listing/details, School Sport and Ticketek NZ;
stable JSON, CSV, RSS, GeoJSON and ordinary HTTP sources run directly in Tymra.

## Responsibility split

- Tymra owns scheduling, source configuration, request budgets, locking, circuit state, persistence, canonicalisation and acceptance reporting.
- Argus owns Patchright navigation, challenge detection, source extraction and browser evidence.
- Tymra submits one read-only capture to `POST /v1/jobs`, persists the returned Job ID in
  `ArgusExecution`, parks the parent collection Job and releases its Worker lease.
- A database-backed `ARGUS_JOB_POLL` Job performs one status request per activation. While Argus is
  still running it moves itself back to `PENDING` with a later `runAt`; at a terminal state it saves
  the result and wakes the parent collection Job.
- The parent resumes the same `CollectionRun`. A stable trace ID prevents duplicate Argus submission,
  and evidence upserts prevent duplicate artifacts when earlier collection steps are replayed.
- After the parent has persisted its business records and completed the `CollectionRun`, Tymra downloads
  every referenced HTML/screenshot through Argus's authenticated evidence API. It verifies the response
  byte count, pointer SHA-256 and `X-Argus-Content-Sha256`, writes the file atomically to the Tymra evidence
  volume, and changes the artifact reference to `tymra-evidence:`. Only then does it submit the exact
  `result_sha256` to `POST /v1/jobs/{jobId}/ack`. A copy, integrity or database update failure prevents ACK.
- `ticketmaster-public` captures fixed city listings and selectively required details in a headed, persistent browser profile.
- `eventfinda-public` captures nationwide listings and bounded details in a headed, persistent browser profile.
- `rbnz-fx` supports the fixed RBNZ B1 exchange-rate page.
- `sporty-school-sport-public` supports bounded School Sport NZ and School Sport Canterbury event windows.
- `ticketek-public` supports one bounded national listing and selectively queued event details.
- For successful and partial results, Tymra selects the source normalizer only when `data_schema` and
  `schema_version` exactly match the submitted Connector/workflow. Unknown versions, missing markers
  and another Connector's payload fail closed as an upstream contract error before business data is
  persisted.
- Argus is required in development and production. Tymra has no in-process or private Browser Worker
  fallback.

## Delivery integrity and retention

Tymra checks the received Job result SHA-256, Job ID, contract version and terminal status before
saving the response to PostgreSQL. The hash covers the result object without `result_sha256` in its
received key order; JSONB may reorder keys, so a persisted result must not be rehashed as wire data.
Business mapping requires the requested capture trace, connector and workflow identity.

Before ACK, Tymra verifies downloaded evidence bytes, writes a temporary file, syncs the file,
renames it, and syncs the containing and newly relevant parent directories before changing database
references. A retry with an existing `tymra-evidence:` reference checks the actual local file's size
and SHA-256 and syncs it again. Missing, corrupt or unsynced files block ACK, even if the database
already holds a local reference. These guards require a release-time check on the target evidence
volume; local tests do not prove the production filesystem's durability after power loss.

Copy-before-ACK does not extend raw-data retention. Current `retentionCleanup` soft-deletes expired
`RawArtifact` payloads and references, but does not yet remove copied evidence files or trim retained
`ArgusExecution.result` data. Physical cleanup needs a separate bounded implementation and recovery
plan; do not treat a soft-deleted row as proof that raw bytes have expired.

## Local configuration

Set these values in Tymra's untracked `.env`:

```text
ARGUS_API_BASE_URL=https://api.argus.test
ARGUS_API_TOKEN=<the same independent random token configured in Argus>
ARGUS_TIMEOUT_MS=60000
ARGUS_JOB_POLL_TIMEOUT_MS=180000
ARGUS_PUBLIC_QUEUE_TIMEOUT_MS=3600000
ARGUS_EVIDENCE_ROOT=./data/argus-evidence
MKCERT_ROOT_CA_PATH=<the rootCA.pem below `mkcert -CAROOT`>
```

The token must contain at least 32 characters and include the Argus Job and `evidence:read` scopes.
Do not reuse `CRON_SECRET` or another application secret.
`ARGUS_TIMEOUT_MS` is the deadline for one browser capture. For Eventfinda, Ticketmaster and
Sporty School Sport durable Jobs, `ARGUS_PUBLIC_QUEUE_TIMEOUT_MS` bounds queue waiting separately
(default one hour, configurable from ten minutes to six hours). Queued status checks are thirty
seconds apart. Once Argus reports its persisted `started_at`, `ARGUS_JOB_POLL_TIMEOUT_MS` bounds
execution from that immutable time and must exceed the capture deadline. Repeated polling and
Worker restarts do not extend execution time. Other connectors, including OTA, retain their existing
submission-to-result deadline. Shared Argus concurrency and private sessions are unchanged.

## Durable execution state

`ArgusExecution` is the local source of truth for the Tymra-to-Argus handoff:

- `orchestrationKey` is unique per parent Job and capture target.
- `argusJobId`, connector, workflow, URL, deadline and the terminal result survive Worker restarts.
- Deferred polling does not consume the parent or poller's retry budget; `attemptCount` reflects real
  attempts rather than status checks.
- Cancelling the parked parent causes the poller to call `DELETE /v1/jobs/{jobId}`. The local parent
  remains authoritative even if that best-effort network request fails.
- A polling deadline requests cancellation of this execution. The three queue-aware public
  connectors confirm terminal release before waking the parent with `TIMEOUT`; pending cancellation
  is checked after thirty seconds. Normal source failure handling then finishes the `CollectionRun`.

Direct browser CLI calls without a database Job use a separate synchronous path; non-dry-run
browser collection must use the queued path where its collector requires durable persistence. Scheduled
and manually queued browser captures, including Eventfinda listings/details, Ticketmaster
listings/required details, RBNZ, School Sport and Ticketek, use the durable Argus path. The Worker's
direct Eventfinda/Ticketmaster page loader is an explicit test fixture, not the production transport.

Selected accepted Argus data contracts are listed below. This is not the full connector inventory;
the current Worker contract registry is `apps/worker/src/clients/argus-client.ts`.

| Connector/workflow | `data_schema` | `schema_version` |
| --- | --- | --- |
| `ticketmaster-public / collect_listing` | `ticketmaster-public.collect_listing` | `1.0.0` |
| `ticketmaster-public / collect_detail` | `ticketmaster-public.collect_detail` | `1.0.0` |
| `eventfinda-public / collect_listing` | `eventfinda-public.collect_listing` | `1.0.0` |
| `eventfinda-public / collect_detail` | `eventfinda-public.collect_detail` | `1.0.0` |
| `ourauckland-public / collect_listing` | `ourauckland-public.collect_listing` | `1.0.0` |
| `ourauckland-public / collect_detail` | `ourauckland-public.collect_detail` | `1.0.0` |
| `rbnz-fx / collect_exchange_rates` | `rbnz-fx.collect_exchange_rates` | `1.0.0` |
| `sporty-school-sport-public / collect_events` | `sporty-school-sport-public.collect_events` | `1.0.0` |
| `ticketek-public / collect_listing` | `ticketek-public.collect_listing` | `1.0.0` |
| `ticketek-public / collect_detail` | `ticketek-public.collect_detail` | `1.0.0` |

The Eventfinda and Ticketmaster contracts are in the bounded production collection path. Their
daily progress schedules were enabled after source-specific two-pass acceptance; other sources
retain their own operating gates. See `docs/traceability.md` for the dated production state.

The Worker reaches the same HTTPS API origin used by cross-network clients. Docker maps `api.argus.test`
to the host gateway, and Node trusts only the mounted mkcert development root CA. Do not disable TLS
verification.

Argus is a cross-application service rather than a Tymra-owned component. Its development origins mirror
the production `argus.nz` structure:

- API: `https://api.argus.test`
- human handoff: `https://connect.argus.test`
- service diagnostics: `https://argus.test/health` and `/readiness`

Tymra does not construct handoff URLs or depend on noVNC paths. Argus must return any complete,
short-lived handoff URL through its handoff contract.

## Additional source ownership

Ordinary read-only HTTP that returns the required facts belongs to Tymra. Rendering, browser
cookies, same-context navigation, challenge handling and screenshot evidence belong to Argus.
Tymra owns business rules, source budgets, schedules, normalization, canonical identity and lineage.
Argus health, readiness and authenticated connector inventory must be checked in the actual target
environment; a registered schema in Tymra does not prove that runtime supports it.

- School Sport uses `sporty-school-sport-public.collect_events@1.0.0` with separate national
  and Canterbury source identities. Retain national raw rows before bounded regional filtering.
  Administrative/unlocated rows remain raw; source organization cannot invent a Canterbury venue.
  Region-level location does not establish city, venue or accommodation impact.
- Ticketek uses `ticketek-public.collect_listing@1.0.0` and `collect_detail@1.0.0`.
  Preserve listing facts if selective detail fails; classify challenge evidence instead of treating
  an HTTP 200 challenge as an event or forcing a successful parser result.
- Lincoln uses `lincoln-university-key-dates.collect_key_dates@1.0.0`; retain all source facts
  but normalize only resolved demand-relevant dates under `christchurch_university_dates`.
  Administrative or unresolved dates cannot become demand signals.
- Dunedin, Auckland Airport monthly traffic and Ministry of Transport airline performance use
  the fixed source contracts in [national coverage](nz-market-public-signal-coverage.md).
  Named workbook downloads require the same byte/hash/copy gate as HTML and screenshots.
- Official venues/universities use canonical event flow; live airport/cruise facts use
  source-isolated transport-flow lineage. Capacity is not actual attendance/passenger count.
  Missing facts and unsupported locations remain explicit coverage gaps.

A finite Argus retention deadline is not automatically extended indefinitely by a missing ACK.
Tymra must complete delivery within the actual contract, detect expired/missing objects and
fail closed; never weaken hashes or infer successful retention from metadata alone.
CAPTCHA handoff must use the exact expiring session/URL returned by Argus; non-CAPTCHA access
challenges remain on the source cooldown path.

## Acceptance

Use [local acceptance](acceptance.md) and the corresponding source contract. Development
scheduling stays disabled; dry-run may still submit an external browser Job. A bounded probe is:

```sh
pnpm cli collect:events --source eventfinda --market new-zealand \
  --phase discovery --max-pages 1 --limit 2 --local-acceptance --dry-run
```

Non-dry-run browser collection uses the durable queued entrypoint. Verify two-pass business
persistence, stable identity, request limits, schema/version, all required local evidence bytes,
ACK and remote purge. Cancellation, parked-parent restart and incomplete evidence have their own
regression cases. Production trial/enable/recovery must use its guarded source-specific flow,
never a local-acceptance flag.

Dated ACK, schema, restart, public-source and six-OTA evidence is indexed in
[evidence](../evidence/README.md). Previous Job IDs, private Browser Worker and direct-HTTP
experiments are historical; active release and remaining natural-cycle checks are in
[traceability](../traceability.md).
