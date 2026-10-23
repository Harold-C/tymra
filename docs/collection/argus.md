# Argus browser collection boundary

Last updated: 2026-10-06 (bounded public queue wait and execution deadlines)

## Bounded OTA production pilots

### Christchurch staged observation pilot (local only, 2026-10-15)

This is the current small-pilot preparation contract. The larger historical panel plan below remains
a separate example, not the budget or entry gate for these seven objects. No collection is authorized.

`market-observation.ts` separates source-scoped observation eligibility, per-quote comparability,
formal `christchurch-fixed-panel-v2` admission and execution permission. A reviewed source listing
and repeatable unit plus attributable two-adult support permit observation. Exact residential address,
24-month history, all six dates being available and approved reserves are not required at this stage.
An attributable selected two-adult quote does not establish maximum occupancy. Unknown fees or
conflicting cancellation amounts retain raw evidence but cannot produce a comparison key/amount.
Comparison keys isolate unit, stay dates, nights, adults, units, currency, immutable public profile,
terms and instant/request booking mode. Two-night totals are actual package totals; nightly equivalents
are descriptive only and never spliced into single-night series. Formal panel gates remain unchanged.

Current local source: `runtime/market-data/christchurch-supply-20261014/sources/staged-observation-review.json`.
Its seven objects are Aalton and Carnmore (one night, 3 checks/week), Cosy and Lincoln (two nights,
3/week), Michael (two nights, 1/week), Karen and William (one night, 1/week). All check two fixed stays.
Cosy/Lincoln retain their common building concentration; they are not independent reserves. Airbnb
source-scoped objects do not add verified locality coverage. Existing quantity/fee evidence is dated
2026-10-14, not a fresh quote. Carnmore's reviewed room signature still requires exact-selection preflight.

Example observation dates: 2026-10-19 through 2026-11-15; stays: 2026-11-17 and 2026-11-21, both
after the observation period. November 21 is a proposed anchor without saved inventory verification.
Rebase the whole plan before activation if start changes, and lock anchors after initial preflight;
never substitute dates/units in response to unavailable inventory. The pure planner generates 28 days:
120 quote captures + 14 initial detail/capability captures + 28 weekly identity captures + 33 shared
retry captures = **195 proposed maximum executions**, **0 authorized**. Source base allocations:
Expedia 48 quotes + 4 initial + 8 weekly; Booking the same; Airbnb 24 + 6 + 12. Retries share one pool,
max 2 attempts/query, concurrency 1, daily ceiling 42. Extra captures count toward these limits.
Cost/capture and monetary cap stay null until measured; current live limits are not changed.

Week 1 checks identity/context/field quality; week 2 matched quotes and fee conflicts; week 3 missingness
and concentration; week 4 per-object review of cost, actual observation days and comparability. Classified
unavailability is not price success. Regional publication requires separate coverage/representation review.
Challenge/login/rate limits stop the source; identity changes stop that object; budgets never expand
automatically. Unknown terms block comparison, not future observation. No booking/request submission.

Offline generation, without environment loader, DB, queue or provider calls:

```sh
node node_modules/tsx/dist/cli.mjs apps/worker/src/operations/plan-christchurch-observations.ts \
  --roster /absolute/path/staged-observation-review.json --out /absolute/path/new-plan.json
```

The existing local preparation generator embeds this evaluated plan in
`holiday-home-preparation.json → scopedPilotPreparation.stagedObservation` and updates the existing
Chinese sample report. Old `qualified=false` values and v12 holds remain historical formal-panel
preparation facts; they are not observation-eligibility results. The current output reports observation
eligibility, unassessed historical quotes, unsubmitted formal panel and unauthorized execution separately.
Both planners support explicit one/two-night checkouts locally; no real Argus two-night capture,
worker persistence, source-capability acceptance or scheduler wiring was performed for this cohort.

### Christchurch four-week regional-price plan (local only, 2026-10-14)

This is an offline planning contract, not permission or a scheduler/executor activation.
Harold authorized local term standardization, fixed-sample mechanics and a four-week plan;
production collection, source budgets, Argus limits and schedules remain unchanged.

`public-rate-terms-v1` keeps original meal/cancellation/payment/fence strings and derives a separate
canonical comparison key. Only explicit aliases are equivalent. Unknown meals, generic `STANDARD`
cancellation, partial identity, undisclosed payment and promotional conditions block trend comparison.
Free-cancellation comparisons require an explicit offset-bearing deadline; the key uses hours before
NZ midnight of the stay date, not the literal calendar date. Date-only or truncated prose stays unknown.
Raw observations are not rewritten. New panel/address captures save this versioned object in
`unitConstraints.normalizedRateTerms`. New captures also store an immutable anonymous profile key in
`unitConstraints.marketCollectionProfileKey`; historical context is not reconstructed from today's
mutable CollectionProfile row. Region trends also require a known collection-profile identity;
old snapshots lacking payment/profile fields remain usable as quote evidence, not comparable trends.

Anchor refresh revisits existing active anchor IDs and does not automatically remove an unavailable
anchor or replace it with a higher-ranked newcomer. Rotating selection cannot take over an anchor.
The Christchurch manifest additionally pins Property, Unit, Listing, source, category, market,
collection profile and canonical terms. Coverage retains every frozen member in its denominator;
a change in identity/source/context/terms is a gap. Additions/replacements require a reviewed new
manifest revision, never a daily rebalance. The offline manifest is not consumed by live jobs yet.

The original 40-property capacity is a historical example. D-058 permits an evidence-led size,
allocated by reviewed suburb × accommodation-type targets, superseding the fixed 40 and earlier
16/12/12 split. The initial public-research roster selected 52 properties in 25 localities,
plus 15 reserves (expanded to 23 in D-059 below) and 5 separate exploratory properties; these are property candidates, not executable
OTA members. True market supply weights remain unknown. Within each stratum, diversify comparable price bands, capacity, physical unit
kind and spatial spread. Within the original one-night cohort, entire-place candidates must support
the same two-adult, one-unit, one-night query. The user subsequently approved a separate two-night
holiday-home research cohort (2026-10-14): two adults, one entire unit, NZD, anonymous public rate.
Its two-night total and per-night equivalent must never be spliced into the one-night series;
cleaning fees remain per-stay. This is local preparation only. Since 2026-10-15 the offline planner
accepts `--nights 1|2` (default 1); real two-night source execution still needs capability acceptance,
reviewed identities/terms and a rebased budget. No research dossier is an executable manifest.
Missing strata cannot be filled by another area's hotels. Supply expansion factors require sourced,
dated unique-property counts and are not proof of statistical representativeness. See DATA-CORE-003A.
Up to 10 weekly discovery candidates stay outside the price-index denominator.

The example start is **2026-10-19**, end **2026-11-15** (28 NZ calendar days); these are tentative,
not booked execution dates. Rebase the entire reviewed plan before activation if start changes.
Each day queries D+7/14/30/60/90, next Tuesday and next Saturday, plus locked stays on start+21
and start+27 until the day before check-in. Coincident dates are merged with all reasons retained.
Locked dates are observation examples, not asserted event dates; a real event must have confirmed
source/date evidence before substituting a locked date and regenerating the budget.
This historical budget example uses 1 night, 2 adults, no children, 1 unit, NZD, the pinned anonymous profile and exact unit.

| Historical 40-property example budget | Capture/query units |
| --- | ---: |
| Normal exact-unit/date price queries | 9,280 |
| Retry reserve, at most 20% of daily normal queries | 1,856 |
| Weekly discovery, 10 candidates × at most 2 captures × 4 weeks | 80 |
| Four-week maximum capture executions | 11,216 |
| Separate preflight identity/capability reserve | 96 |
| Combined proposed ceiling, including preflight | 11,312 |

One exact quote query budgets one `collect_rates` capture; this is **not** one HTTP request or a
guaranteed usable rate. Detail refreshes and other extra captures must fit a separately reviewed
reserve, not be hidden in price-query counts. Maximum one retry/query, all attempts counted even on
failure; unused quota is not an instruction to run more work. Daily absolute ceiling 500, concurrency 1,
no source-limit bypass and no automatic escalation. Per-source allocations follow the pinned manifest
and require review against both Tymra and Argus limits; current bounded limits cannot execute this plan.
Target window is 02:00–04:00 NZ, to be proven by measured p95 capture duration and pacing before use.
An overrun is reported as missing coverage, not collected later under a false common snapshot time.
Monetary cap and cost/capture remain unset until measured; proposed cost is at most
`11,312 × measured NZD/capture + storage/proxy incremental charges`. No spend is authorized here.

Preflight: review city/coordinates, physical unit, source capability, exact public terms/profile and
the reviewed target number of unique properties; measure time, success and cost on separately authorized bounded captures.
Week 1 establishes baseline and field/identity quality. Week 2 checks matched daily/weekly coverage.
Week 3 follows the first locked stay; week 4 follows the second and evaluates cost/coverage before any
expansion. Daily source challenges halt that source; missing prices, sold out and minimum-stay
restrictions remain distinct from collection failure. Never substitute a different property/date/rate.
Proposed pilot quality goals: >=80% valid fixed-member coverage per published stratum/comparison,
no identity drift, no unclassified collection-context changes; under-covered comparisons stay blank.
The existing page's 3-property technical gate is not representative-market acceptance. A reviewed
cohort-aware, coverage-gated index and source execution wiring remain activation deliverables.

Offline generation (no environment loader, database, network or queue):

```sh
node node_modules/tsx/dist/cli.mjs apps/worker/src/operations/plan-christchurch-pilot.ts \
  --snapshot /absolute/path/market-snapshot.json --start 2026-10-19 \
  --out /absolute/path/new-plan.json
```

Optional `--candidates /absolute/path/reviewed-candidates.json` and `--targets /absolute/path/targets.json`
accept arrays matching `sampleCandidateSchema` and `sampleStratumTargetSchema`. The output includes
versioned labels, flat quantitative tags, a deterministic selection proposal, exclusions and quota gaps.
Absent evidence stays null; no LINZ, OTA or production call is made to fill missing labels.
An optional `--panel /absolute/path/reviewed-manifest.json` preserves an already frozen v2 manifest.
`--target-size N` changes draft capacity (default 40 for the historical example); an existing frozen
manifest cannot be resized by this argument. The planner recomputes quotes/retries/preflight reserve,
and explicitly blocks activation when any proposed day exceeds 500. Preflight reserves two captures
per property plus 20% contingency. A larger roster never changes live source limits.
Version `christchurch-fixed-panel-v2` requires reviewed suburb/city/region, unit kind, capacity and
source-backed labels. Earlier v1 drafts are retained as historical files and require explicit review
before conversion; the planner does not silently migrate or freeze its selection proposal.
The planner refuses unknown options and existing output files. Even a full manifest produces
`DRAFT_NOT_ENABLED`, with `executionEnabled=false` and explicit activation blockers.
Without a reviewed manifest it reports candidates and the target-size shortfall; it never invents
properties or treats the snapshot as identity/representativeness approval. The present snapshot
offers 3 Christchurch candidate properties but omits profile/payment fields, so frozen membership
was **0/40** in the original draft. D-058 research now supplies 52 labelled property candidates but
still zero exact OTA members. The budgets are capacity planning, not ready-to-execute job counts.

Current local research artifacts are under
`/Users/haroldchen/Development/tymra/runtime/market-data/christchurch-supply-20261014/`:
`Christchurch-供给与固定样本清单.md`, `christchurch-supply-and-samples.json`, `pilot-candidates.json`,
`pilot-targets.json` and `four-week-plan-52.json`. The 52-property plan has 12,064 normal queries,
2,429 retry reserve and 80 discovery captures (14,573 total), plus 125 preflight reserve.
Peak 582/day exceeds the unchanged 500 draft limit on 14 days: revise cadence or explicitly review
budget before activation. 30/90/180-day live inventory checks and longitudinal continuity remain unverified.

#### Primary/reserve preparation follow-up (D-059, local only)

`panel-preparation.json` and `Christchurch-主样本替补与采集准备.md` in the same local research
directory supersede the original 15-reserve selection for preparation purposes, while preserving
the original supply inventory and its SHA-256. They contain 52 primary and 23 reserve dossiers,
not accepted Argus requests. All bindings are unresolved/null and `dispatchable=false`.
26 primaries have a same-suburb/type candidate: 18 non-overlapping first choices and 8 shared-only
positions. Another 26 have no same-cell reserve; matching room/terms/price remains unverified for all.
These gaps are not filled by cross-suburb properties. Addington Stadium is held for address conflict.

The same-day local desk follow-up is `ota-readiness-review.json` and
`Christchurch-OTA核验与替补缺口.md`. It preserves the 75-property preparation snapshot and adds
two provisional same-cell leads (Airport Birches / Russley, Belle Bonne / Sockburn), for 77 research
properties. Of the original 26 gaps, 24 have no qualified new candidate and two have comparability
holds; none of those 26 has an accepted replacement. Area, amenities, payment and exact-unit
availability must be matched before accepting these leads. No new binding is dispatchable.
The 75 properties received six dated property-level searches (450 combinations); 71 returned an
offer at least once and 42 at all six dates. Browser checks, including alternate returned dates,
read room offers for 71 properties. These checks do not pass the six-date exact-unit gate.
The saved connector responses and manual DOM/policy fact transcriptions are desk evidence, not
Argus raw captures or source-adapter acceptance. Do not bind UI rate-block IDs as ratePlanId,
use `bbasic` partner placeholders, mix member prices or substitute another room when the fixed
unit is unavailable. Resolve the four remaining unverified offer cases and all physical-room,
fee and precise cancellation-time gaps before freeze. No recurring collection was started.
If the two provisional leads enter preflight, the original formula adds 16 base captures plus
four retry-reserve captures (740 total ceiling); stop rejected leads early. Recompute the recurring
budget only after the accepted roster is fixed. This is a planning adjustment, not authorization.

The local offline preparation generator proposes a lower cadence that includes reserves:
daily D+7, D+30, next Saturday and the two locked stays; Monday D+14, Wednesday D+60, Friday D+90;
Thursday two forward dates per reserve, Sunday at most 20 discovery captures. It deduplicates dates.
For the tentative original start, this is 7,124 main queries + 184 standby queries + 80 discovery
+ 1,472 retry reserve = **8,860** four-week captures; peak **375/day**. Farther lead-time series now
have weekly observations and cannot be labelled daily. The earlier 14,573 plan remains historical.
This proposal does not alter the production per-source limits or prove the 02:00–04:00 window feasible.

Preflight covers all 75 properties: at most two identity captures and six exact-unit forward queries
per property (D+30/90/180 weekday and weekend), plus 20% retries, **720 captures**. At a proposed
120/day it needs at least six days, so rebase the start after acceptance rather than promising
October 19. These counts are planning ceilings, not authorization or wire payloads; stop rejected
candidates early. Extra details, alternate sources and overlap capture need explicit reallocation.
One retry maximum, source pacing/concurrency and actual costs require review; no additional capture
allowance is hidden. Standby captures never enter the current primary denominator.

Review triggers: explicit closure evidence or identity drift immediately; otherwise seven distinct
NZ days, at least three successful site checks across three future windows can trigger pause review.
Neither threshold retires a member automatically. Sold-out, minimum stay, unopened horizon, timeout,
challenge and parse failures remain separate. Before promotion recheck identity/terms within 72 hours.
Prefer seven observation days with at least three matched stay-date quotes covering weekday/weekend;
weekly standby checks alone do not meet that daily overlap. An abrupt exit without overlap starts a
labelled new cohort. Preserve original denominators, withdrawals and effective version history.
These are local pilot rules, not empirically validated survival guarantees or a live recovery engine.

Tymra owns the dossier-to-request gate, sampling decisions, schedules, budgets, canonical identity,
normalization, replacement review and analytical coverage. Argus owns browser execution and raw
evidence. Resolve source capabilities/identity through existing `discover_listings`/`resolve_listing`
and `collect_rates` contracts; store/check evidence before ACK. No Argus changes or submissions
were made. Exact OTA bindings, future inventory, price baseline, execution wiring and source/cost
acceptance remain required before freezing and enabling a panel.

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

Booking's additive optional `referencePrices` field in `ota-public.collect_rates@1.0.0` preserves
explicit original comparison and member-only amounts separately from public price fields. The
receiving schema bounds each amount/label and rejects an available/priced `REFERENCE_ONLY` rate.
Validated same-provider references are saved in `RawArtifact.payload.otaReferenceRates`, with
listing/unit identity, NZD, dates and guest/unit counts, before the public acceptance gate. The
wire result and original evidence retain their normal integrity and ACK rules. Booking reference-only
captures complete with `rateOutcome=REFERENCE_ONLY`, zero public-price successes and a retained
`REFERENCE_PRICES_ONLY` coverage gap. They create no public price observation, do not increase
price coverage or last-success time, and allow the source to continue collecting other units.
Replaying that completed capture neither fetches nor charges again. Invalid or mismatched evidence
still fails; other sources retain their existing reference-only rejection. Public-price mapping
accepts existing `PUBLIC`, `PUBLIC_SIGNED_OUT` and `PUBLIC_ANONYMOUS` fences; member/App/promotion
and reference amounts cannot be promoted into that calculation. Actual failure pausing marks both operational and
health status `DEGRADED` as well as suspending the named source/plan.

This change needs no migration and keeps required fields and request versions unchanged. Deploy
the receiving Tymra update before the Argus extractor. Older extractor results remain readable;
older receivers see null public prices/unknown availability but omit optional reference metadata.
Historical failed results are preserved. Re-enabling Booking still requires its normal exact-job,
positive anonymous all-in price, retained evidence and delivery acceptance, after an authorized release.

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
