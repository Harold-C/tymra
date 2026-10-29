# Argus browser collection boundary

2026-10-19 approved daily observation cadence (Tymra only): after shared-capacity review,
`dual-window-daily-v1` opens each reviewed stay window once per NZ calendar date from its audited
`dailyStartsOn`. The original `startsOn` still freezes the seven-day stay cohort and month anchors;
observation frequency never changes a property's reviewed dates, room, nights or execution lineage.
Existing same-day successful windows count; failed/used keys, held members and stopped sources are
not rearmed. Jobs/captures retain maxAttempts=1, concurrency one, source pacing/circuit, prior-work
priority and weekday 09–17 avoidance. Unsubmitted prior-day windows expire as recorded gaps,
without pausing an otherwise valid member or submitting catch-up work. Already accepted external
jobs are reconciled once, not resubmitted. Identity TTL and spare 21–28-day renewal remain.

Daily activation changes only this plan's cadence, with expected-state fencing and a signed audit;
restore the prior cadence at selected-plan idle before rolling back to a weekly-only worker image.
Do not restore old database snapshots or remove new jobs/holds to roll back. The shared Argus image,
other plans and source configuration remain unchanged. Progress queries project only required
28-day metadata, never retained wire/HTML. Daily volume is 136 quote windows (952/week) plus
identity renewals, not a new attempt quota or a guarantee of available prices.

The v6 reference view defaults to adjacent NZ-date comparison, with no carry-forward over missing,
failed or unavailable dates. Weekly summary uses the last completed window per original seven-day
cycle and compares matched offers across adjacent cycles, not the average of daily percentages.
Both retain actual observation dates and exact stay/room/offer separation; flexible arrival dates
remain descriptive levels only. Safety-limited reads withhold changes. Daily coverage records due
windows, completed windows, eligible positive prices and gaps separately from all-history coverage.

2026-10-19 approved reviewed-window extension (Tymra only): ten same-property members can receive
`reviewed-stay-windows-v1` labels containing two ordered day offsets from the cycle's frozen Tuesday,
review date and source-evidence SHA. Offsets are explicit, not derived from each capture's availability.
They stay fixed throughout the seven-day cycle and shift with its starting-month anchors; past arrivals
are not dispatched. The other 58 members retain original task keys, identities and completion history.
French Bay's reviewed group is two nights, Cosy is a separate three-night group, and Southwark's
reviewed alternate Deluxe Apartment starts a new unit baseline. All 68 property seats remain.
Applying the bounded operator upgrade requires idle selected work and a fresh state hash, writes a
signed audit, clears only the ten changed bindings and holds them pending individual identity and both
new windows' original-source review. Old jobs/runs remain immutable. Source blocks/no retry and shared
work priority remain; rollback restores compatible controls before the old image, retaining later
unrelated holds and every job. No new schedule, source count quota, automatic fallback or shared Argus
release is introduced. Actual release and source acceptance are tracked separately in traceability.

Last updated: 2026-10-17 (selected roster has no count ceiling; explicit manual acceptance remains separate)

2026-10-18 sample quote trends are a read-only consumer of completed selected-plan facts and
verified delivery. No new Argus workflow, source capture, execution retry, schedule, quota or roster
change is introduced. `sample-quote-trends-v3` keeps displayed member references separate from
public/partner displayed totals, groups inclusive/undisclosed fees and disclosed/undisclosed meals,
and retains RAW_ONLY/unknown browser context and booking-mode facts. Missing fine purchase terms
are labelled rather than blocking a uniquely verified displayed-price reference. Ambiguous offers,
amount/identity conflicts and unverified delivery remain excluded. Legacy receipts use the same
canonical verifier as Worker, tied to the original delivered execution, without rewriting history.
Its narrower descriptive reference contract is in `docs/product/data-core.md`; it does not turn these
observations into certified comparable prices, RateObservation or a regional index. PostgreSQL projects
only the required rate facts from retained verified wire after a bounded date/row selection; legacy
wire is verified and projected one at a time within explicit bounds. Full wire,
HTML, screenshots, credentials and other queues never enter the member response.
Repeated Booking member plan IDs may be disambiguated using exact row selectors and native
amounts from the same retained, SHA-verified snapshot. Tymra appends a versioned TransformationRun
and artifact lineage after reliable delivery/ACK and before completing the run; completed raw runs and original wire remain immutable. Historical
evidence replay is a separate bounded operation with no source capture. The member read joins the
derived receipt to its run, member/manifest/unit/date, wire SHA and artifact hash, including after
the original artifact's normal TTL. Breakfast included and breakfast extra remain separate. This
does not require a shared Argus release or change public-price, fee or membership eligibility facts.

Selected Booking identities carry the exact frozen dates, two adults, zero children, one room and
NZD through optional `identity_stay`; physical capacity remains source-derived. Deploy this caller
change only after shared Argus supports dated Booking identity. Anonymous partner offers retain
`PARTNER_OFFER` and `BOOKING_PARTNER_OFFER`; they remain RAW_ONLY with null comparison keys and
unknown fee components preserved, never merged with direct PUBLIC products.

The latest user authorization removes Argus daily/lifetime count ceilings and this selected roster's
Tymra daily count gate on every OTA channel. Other plans' DataSource settings remain unchanged;
selected-roster executions do not spend their legacy counters. The 24/20/6 and 195/143 numbers below
are historical descriptions, not current limits. Concurrency one, pacing, cooldown/circuit protection,
stop on block and no automatic retry remain.

Selected Booking identity explicitly opts into partial 1.1.0 units with unknown sharing; other callers
keep their existing response. Unknown sharing does not establish canonical units or comparable prices.
Verified original wire JSON is retained as text beside independent database-representation hashes and
committed atomically with terminal execution state; no numeric rounding bypasses integrity checks.
An operator may authorize an exact held-member identity and its two unchanged stay windows using
expiring, HMAC-audited one-attempt jobs. The marker is in the idempotency key, leaving rollback task/state
schemas unchanged. The scheduler never creates these jobs; failed members remain held. Only successful
identity/window deliveries plus original-source review release that member, preserving other members.

## Bounded OTA production pilots

### Public OTA room-area compatibility (2026-10-16 production release)

The consumer preserves optional positive `areaSquareMetres` on extracted units so a room's
observed area can support identity review. Missing or null area remains unknown; area alone
does not establish an exact unit or price comparability. Existing deliveries without this field
remain valid. The release includes no local manual observation executor, execution ledger,
temporary daily-cap exception or four-week scheduler activation. Production and rollback verification
is recorded in [traceability](../traceability.md#2026-10-16-公开-ota-房型面积接收生产发布),
separately from the historical preparation contract below.

### Christchurch selected-sample formal collection (2026-10-16)

The user cancelled the one-off 195-execution acceptance ceiling and authorized the full selected
roster for production collection, retaining normal source daily limits, concurrency and stop-on-block,
with no automatic retry. `christchurch-selected-samples` supersedes the disabled three-object plan;
historical jobs/results and their original budget receipts remain immutable. No 143/195 lifetime limit,
90-new-capture ceiling, four-week graduation gate or expiry from the old pilot controls this schedule.

The protected manifest `runtime/market-data/christchurch-supply-20261014/selected-collection-manifest.json`
contains all 52 initial property seats plus subsequent selected commercial and holiday-home members,
deduplicated against the seven-object roster. It records 68 members, 67 enabled for source/room execution
and one explicit hold (Spencer Beach: no exact OTA binding). These counts describe configured members,
not successful price captures. Reserves and probable aliases do not become extra independent seats.

The initial 52 property proposals had no frozen OTA unit binding. Where an exact two-adult OTA room
was manually observed, it can seed a NEW source-unit baseline; its actual ID/name and differences from
the operator proposal are retained. This never establishes a physical cross-platform room crosswalk,
splices old different-room prices or guarantees capacity/amenities. Dorm beds and powered sites are excluded.
The later reviewed Aalton/Carnmore/Lincoln choices are preserved. Missing 24-month history, independent
reserves, all six available dates or normalized terms do not block capture of attributable raw outcomes.

Each member resolves its unique source unit once, reuses verified delivered identities for up to 28 days,
and is priced independently; no all-members preflight barrier. Where names/signatures are used, ambiguous
or absent matches hold only that member. Explicit `dual-window-weekly-v2` cadence gives this plan alone
a dedicated Booking allowance of 24 captures per NZ day for its first seven NZ dates, then 20/day.
Other sources retain six/day or their lower configured allowance. DataSource rows and other schedules
keep their settings; dedicated Booking traffic does not consume legacy plans' six-call counter.
Concurrency stays one and existing work takes priority under the shared submission lock. Without the
explicit cadence the legacy six/day rule remains. No automatic replay, retry or fallback unit is added.
Blocked/login/challenge/rate-limit outcomes stop this schedule's source; other errors hold the member.

Upgraded cycles last seven NZ dates from activation. Exact member/stay windows already observed in the
cycle are not dispatched again; missing windows precede repeats. Both anchors freeze from the cycle's
starting month, including across a month boundary, so a Monday reset cannot starve Saturday windows.
Successful raw unavailable outcomes count as observations, never as fabricated prices. In spare capacity
after cycle quotes, identities renew oldest first between day21 and day28 to avoid a synchronized expiry
backlog; the maximum validity is still 28 days. Failed renewals hold the member with no automatic retry.
This is capacity for weekly pairs when sources remain available, not a guarantee of prices for blocked
or unavailable listings. Show held members and actual raw outcomes independently.

Stay anchors are versioned by observation month: start from the first of that month +60 days, then the
next Tuesday and Saturday (including that base date). October anchors remain Dec 1/5; a cycle starting
in November opens a distinct Jan 5/2 cohort. Both stay length and exact stay dates remain in each observation and comparison key;
never splice cohorts into a seasonal or city-wide index. Calendar boundaries use Pacific/Auckland.
Normal collection remains outside NZ weekday 09:00–17:00 office hours. Every capture and parent job has
maxAttempts=1; delivery polling/confirmation is not a new source capture. Persist hash-verified evidence
before ACK, including failed mapping evidence; successful raw artifacts retain 72 hours, failures 168.

Actual profile, booking mode and unresolved fee/term facts remain unknown. CollectionRun retains raw
observations and quality flags; they cannot automatically become comparable prices, RateObservation or
regional published metrics. Production activation and natural-run results are recorded in traceability.

### Earlier Christchurch staged observation pilot (local only, 2026-10-15)

#### Three-object production preparation (2026-10-16)

The reviewed December series supersedes the seven-object November planning example below for the
next bounded canary. `observation-pilot.ts` freezes three reviewed source units, two stay anchors and
28 observation days. The private manifest and historical ledger are deployment inputs, never image
contents. The baseline is 42 spent of 195; at most 90 further reservations are permitted, leaving 63
unallocated. The initial production canary contains three identities and six price tasks (nine calls,
within ten reserved). Scheduled capacity is 48 prices plus 12 weekly identity checks. Twenty retry
slots and one unused canary slot are reserves, not automatically dispatched work or a new allowance.

`observation-production.ts` stores disabled intent in one dedicated ScheduleDefinition and reserves
each task as a durable Job under its row lock. A task key includes the observation cycle and stay;
replaying the same key does not create another capture. Missed days are not caught up in a burst.
Scheduled identity checks fall on separate days. The production source cap remains six/day and
concurrency one, counting existing production executions as well as reserved pilot work. No local
one-day quota exception is imported. The historical baseline contains receipts, not executable policy.

The explicit canary permission expires within 24 hours and permits only the exact frozen inputs;
it does not enable source discovery, change a source's lifecycle or revive old OTA schedules.
BLOCKED sources remain prohibited. The four-week schedule stays disabled until separately authorized;
the preparation CLI has no activation command. Challenge/login/rate-limit conditions stop that source,
other identity or extraction failures hold the affected object. No alternate room/date is substituted.
Uncertain submissions are retained and require reconciliation instead of blind resubmission.

The existing Worker/Argus orchestration owns polling and leases. CollectionRun.scope retains the
source-scoped identity or evaluated raw offers; ArgusExecution retains wire delivery and RawArtifact
retains verified evidence before ACK/purge. These observations do not enter public RateObservation
or market indices. Unknown actual anonymous-profile or booking-mode attestation and unmatched terms
remain RAW_ONLY; they are observation findings, not fabricated comparable prices. Independent reserve
and long-operation evidence are follow-up work, not prerequisites for source-scoped observation.

Preparation, production deployment and actual canary outcomes are recorded separately in traceability.

An explicitly reviewed repair uses `prepare-repair` with an authorization ID, the held candidate,
a reason, and the exact current reserved/remaining counts. It requires an idle pilot with canary and
scheduled collection closed. Each authorization creates at most three distinct tasks: identity first,
then the two original stay anchors; all three consume the existing retry reserve and overall limits.
No old Job, failed receipt, source policy, frozen unit or stay duration is overwritten. A stale budget,
stopped source or exhausted daily capacity blocks execution. An authorization expires within 24 hours
and cannot be implicitly extended or reopened. Any failure closes that object's repair permission.
`close-repair` releases the held object only after all three Jobs succeed and their deliveries are
verified; it always leaves the four-week schedule disabled. Repair results use the same evidence,
wire verification, RAW_ONLY evaluation and ACK chain as the initial canary.

This is the current small-pilot preparation contract. The older large-panel planning API remains a separate example, not the budget or entry gate for these seven objects. No collection is authorized.

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

### Existing bounded source pilots

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
For the Christchurch selected-sample observation plan, Harold approved visible member prices as
valid conditional references on 2026-10-17. The observation evaluator retains explicitly labelled
`MEMBER_ONLY` entries as `MEMBER_REFERENCE` outcomes after the existing exact provider, listing,
unit, stay, NZD and query-count checks. `raw.totalMinor` is the displayed member reference amount,
not an attested anonymously bookable all-in total; `referencePrice` retains its source label and
rate-plan ID. Original/struck-through amounts do not become valid member observations. The
membership tier/eligibility, offer-level occupancy and availability, mandatory fees and terms
remain explicitly unverified when the wire does not attest them. Public-row cancellation,
payment, meals and fee declarations are never copied onto a member reference. References stay
RAW_ONLY with null normalized/comparison amounts, and are counted separately from public quotes.
This permits a valid reference capture to complete without pausing the selected member merely
because an anonymous public total is absent. It does not change source challenge/timeout or
identity failures, automatically reopen held members, or change general public-price acceptance.
New manual acceptance still verifies identity and both original stay windows, preserves old
terminal failures, and closes only the individually reviewed member. Exact duplicate reference
metadata repeated across public rows is shown once; original wire evidence remains intact.

Trip resolution can add optional `sourceRoomGroupExternalId=trip:<hotel>:room-group:<card>`
without replacing the legacy supplier `externalId`. In the selected roster, an expected-name
target without a pinned supplier/signature may resolve to this explicit own-property visible
physical card when all matching variants identify the same group and room name/type/sharing.
Equal names alone, missing/conflicting groups, another property and room upgrades remain errors.
The resolved identity retains the observed supplier IDs; conflicting or missing capacity, area
and bed metadata stays unknown rather than being selected from one offer. Group quotes retain
each supplier's own meal/payment/cancellation package and require visible offer-level adult
counts, excluding one-adult recommendations. Other rooms' prices never fill an absent target:
a verified dated table with another exact-adult public group may instead yield NOT_LISTED/null.
The executor must support this optional group identity before this caller is released. Older
executors fail closed for group-only requests; no automatic retry or alternate room is permitted.

Validated same-provider references are saved in `RawArtifact.payload.otaReferenceRates`, with
listing/unit identity, NZD, dates and guest/unit counts, before the public acceptance gate. The
wire result and original evidence retain their normal integrity and ACK rules. Booking reference-only
captures in the separate general panel pipeline complete with `rateOutcome=REFERENCE_ONLY`, zero public-price successes and a retained
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
Historical failed results are preserved. Re-enabling Booking requires its exact-job,
retained evidence and delivery acceptance after an authorized release. The explicitly approved
`booking-national-price-gap-v1` policy (2026-10-29) also permits an exact round with retained
original/member references and no verified public total. It revalidates the stored wire result
against the persisted anonymous stay, source, listing and physical unit; an empty result or scope
counter cannot satisfy this exception. Such a round remains `REFERENCE_ONLY`, creates no public
observation and is listed separately in the source health summary. D-039 still requires at least
one real complete positive public price within the preserved evidence window. Other five sources
retain their per-round public-price requirement. Enabling this policy requires a dated, source-scoped
approval in `productionOtaPriceGapPolicy`; it never moves the frozen acceptance boundary.

`ota:production:enable` requires the latest two exact, single-attempt successful Jobs within seven
days, positive physical-unit discovery and complete available price in each (or the explicitly
approved Booking exception above), retained evidence and
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

Copy-before-ACK does not extend raw-data retention. The general `retentionCleanup` implementation
can remove copied evidence after verifying its hash, but its presence does not prove a production
schedule exists. On 19 October the production database had no retention schedule or execution audit;
the host's website-release timer did not cover Tymra evidence.

The daily selected-plan release adds its own bounded hourly maintenance within the existing
`christchurch-selected-samples` scheduler branch, without enabling global membership cleanup or
adding a schedule. Only delivered, non-sensitive HTML/PNG belonging to this plan can expire, after
both their stored deadline and a minimum 72 hours for success / 168 hours for failures. Active jobs,
unverified deliveries, open incidents/repairs, backfills and shared references remain protected and
are filtered before the 100-file bound. Each deletion verifies the physical hash and retains the
artifact identity/hash, quote facts, derived packages, execution/run history and lineage. It does
not trim `ArgusExecution.result`. Existing work takes priority; integrity failure or less than 2 GiB
remaining space stops only this plan and requires explicit operator review, without automatic
capture or cleanup retries. A forced, audited sweep can validate this scope before daily activation.
Weekly cadence has no new automatic cleanup. Production activation/readback is tracked in the
traceability log; code and configured TTL alone are not evidence of effective physical retention.

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
`ARGUS_TIMEOUT_MS` is the deadline for one browser capture. For Eventfinda, Ticketmaster,
Sporty School Sport and production `christchurch-selected-samples` durable Jobs whose source
matches the OTA connector, `ARGUS_PUBLIC_QUEUE_TIMEOUT_MS` bounds queue waiting separately
(default one hour, configurable from ten minutes to six hours). Queued status checks are thirty
seconds apart. Once Argus reports its persisted `started_at`, `ARGUS_JOB_POLL_TIMEOUT_MS` bounds
execution from that immutable time and must exceed the capture deadline. Repeated polling and
Worker restarts do not extend execution time. This polls the same remote Job; it does not submit
another capture or retry a failed visit. Queue expiry, execution expiry and parent cancellation
still cancel only that Job and confirm its release. Other connectors and OTA plans, including the
disabled three-object pilot, retain their existing submission-to-result deadline. Shared Argus
concurrency, source pacing, private sessions and per-capture maxAttempts=1 are unchanged.

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
