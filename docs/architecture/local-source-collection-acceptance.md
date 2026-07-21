# Local source collection acceptance

**Status:** Required project standard for every data-collection channel implemented in the local
development environment.

This document is the canonical local project memory for bounded source acceptance. Source-specific
architecture documents may add stricter controls, but they must not weaken this baseline. A local
acceptance result proves the implementation and its safeguards under a bounded development run; it
does not activate production collection or prove nationwide completeness or multi-day stability.

## Environment and governance boundary

- A dedicated `localAcceptance` mode is available only when `NODE_ENV=development`.
- It refuses to run while the scheduler is enabled. Local acceptance never enables or edits a
  schedule.
- The source must be enabled for `DEVELOPMENT`, but local acceptance does not require or write
  `approved-by` or `license-basis`.
- The run must leave source approval, rights, lifecycle, operational and health state unchanged.
- Local acceptance is not production source approval. Production activation remains a separate,
  deliberate operational decision outside this workflow.

## Bounded real-source contract

- Use the real public source through its production-intended read-only transport and parser. Do not
  substitute fixtures for the real-source acceptance pass.
- Define hard source-specific limits before the request starts: pages, records/details, request
  budget, concurrency, delay and timeout. The implementation, not operator discipline, enforces
  the limits.
- Perform no login, form submission, challenge bypass, purchase, mutation or other remote side
  effect. Access challenges and rate limits stop the batch and are recorded; they are never bypassed.
- Use a distributed per-source lock so overlapping collection attempts fail safely.
- Persist an immutable collection-run record with `localAcceptance=true`, the effective bounds,
  counters, outcome and failure classification.

## Persistence and evidence requirements

- Store short-lived raw evidence or evidence pointers with a content hash, source/run lineage,
  sensitive-data classification and explicit expiry.
- Successful evidence uses the normal short TTL. Parser failures, failed captures and
  manual-required captures use the longer failure TTL.
- Parser failures must be marked at both the application evidence record and the browser/runtime
  evidence store when both exist.
- Persist source-normalised records before canonical records. Preserve explicit source-to-canonical
  links, match method and confidence; do not silently merge uncertain cross-source matches.
- Discovery state is durable. A partial discovery must never deactivate targets that were not seen;
  absence-based deactivation requires the source-specific number of complete discovery passes.
- Jobs use durable leases. An abandoned `RUNNING` job is not recovered before lease expiry and can
  be reclaimed after expiry by another worker.

## Required two-pass acceptance

Run the same bounded real-source collection twice. The first pass proves discovery, parsing,
normalisation, persistence and lineage. The second pass proves deterministic upsert behaviour.

The acceptance record must report at least:

- collection run IDs and effective scope;
- request, page, discovery, detail/record, success and failure counts;
- source-normalised, canonical and link-row counts after each pass;
- rows created on the second pass, which must be zero for stable identities;
- rows updated by the second run, where refresh is expected;
- raw-evidence counts, parser-failure flags and configured TTL class;
- source governance before and after the runs;
- schedule state and runtime health.

## Automated acceptance gates

Every source implementation must include or reuse automated tests for:

1. parser/extractor success, source-specific variants and conservative handling of missing fields;
2. persistence, source-to-canonical lineage and a two-pass idempotency regression;
3. success and failure evidence-retention selection plus time-advanced cleanup;
4. partial-discovery safety and rate-limit/challenge stop behaviour where applicable;
5. rejection of `localAcceptance` in `test` and `production`;
6. rejection of `localAcceptance` when the scheduler is enabled;
7. Redis source-lock contention, release and reacquisition;
8. job lease recovery only after expiry, followed by a claim from another worker;
9. source governance and schedules remaining unchanged;
10. the repository's complete `pnpm verify` gate: lint, typecheck, unit tests, integration tests and
    production builds.

Integration tests should use a dedicated database when local development data must be preserved.
If a live local worker shares the test database, test job claiming must remain deterministic and
must not require stopping the local stack.

## Completion language

Use `locally verified` only after every applicable gate above has actual evidence. Report unsupported
or inapplicable gates explicitly rather than silently omitting them. Never translate local success
into claims of nationwide/full-catalogue completion, multi-day unattended stability, production
capacity, production activation or elapsed real-time TTL expiry.

Those larger claims require their own environment and duration-specific acceptance. Time-advanced
retention tests validate local deletion logic but are not a substitute for waiting the real TTL in
a long-running environment.

## Current source matrix (2026-07-21)

`locally verified` below means that the real bounded transport ran twice and the database evidence
was queried. `implemented_not_verified` means the local code and automated path exist but the real
transport did not complete. A placeholder is not an implementation.

| Source key | Name / data | Intended access | Current implementation | Real local result | Missing implementation or unique blocker | Acceptance |
| --- | --- | --- | --- | --- | --- | --- |
| `development-demo` | Demo rates | deterministic fixture | control fixture | not applicable | fixtures cannot prove a real source | not applicable |
| `browser-neutral-fixture` | Browser contract | controlled local page | control fixture | not applicable | fixtures cannot prove a real source | not applicable |
| `development-degraded` | Failure control | deterministic fixture | control fixture | not applicable | intentional degraded state | not applicable |
| `development-down` | Failure control | deterministic fixture | control fixture | not applicable | intentional down state | not applicable |
| `development-rights-blocked` | Rights control | deterministic fixture | control fixture | not applicable | intentional rights block | not applicable |
| `manual-import` | Operator rate rows | validated CSV/JSON upload | dedicated bounded local path, evidence and idempotent persistence implemented | automated fixture/database path passed; no genuine operator export run | genuine operator file and two-pass real-file DB evidence | implemented_not_verified |
| `booking` | OTA accommodation/rates | read-only public browser | URL parser plus deterministic fixture only | no | source extractor, Browser Worker rate capture and approved test listing | placeholder / not_verified |
| `airbnb` | OTA accommodation/rates | read-only public browser | URL parser plus deterministic fixture only | no | browser extractor; source is also explicitly rights-blocked | blocked / not_verified |
| `expedia` | OTA accommodation/rates | read-only public browser | URL parser plus deterministic fixture only | no | source extractor, Browser Worker rate capture and approved test listing | placeholder / not_verified |
| `hotels` | OTA accommodation/rates | read-only public browser | URL parser plus deterministic fixture only | no | source extractor, Browser Worker rate capture and approved test listing | placeholder / not_verified |
| `agoda` | OTA accommodation/rates | read-only public browser | URL parser plus deterministic fixture only | no | source extractor, Browser Worker rate capture and approved test listing | placeholder / not_verified |
| `trip` | OTA accommodation/rates | read-only public browser | URL parser plus deterministic fixture only | no | source extractor, Browser Worker rate capture and approved test listing | placeholder / not_verified |
| `google_hotels` | Meta-search rates | read-only public browser | URL parser plus deterministic fixture only | no | source extractor, Browser Worker rate capture and approved test listing | placeholder / not_verified |
| `public_holidays_nz` | National and anniversary holidays | Employment NZ public HTML | real bounded fetch/parser plus signal lineage | two passes succeeded | nationwide/full-year is outside this bounded result | locally verified |
| `school_holidays_nz` | School holidays | Ministry of Education public HTML | real bounded fetch/parser plus signal lineage | two passes succeeded | uncertain summer end is deliberately omitted | locally verified |
| `geonet` | Earthquake disruption | GeoNet open GeoJSON API | real bounded API/parser plus signal lineage | two passes succeeded | attribution/production activation is separate | locally verified |
| `eventfinda` | Events | read-only Browser Worker | nationwide listing, durable detail frontier and canonical persistence | bounded two-pass real acceptance passed | unattended multi-day operating evidence | implemented and locally verified; production gated |
| `ticketmaster` | Events | read-only Browser Worker | five-city discovery, durable detail frontier and canonical persistence | automated two-pass detail acceptance passed | repeat bounded live acceptance after current challenge cooldown | implemented; latest live detail runs partial |
| `linz` | Address/geospatial | LINZ Gazetteer public JSON | concrete bounded reference adapter | two real passes succeeded | expand search roster only when needed | locally verified |
| `mbie` | Tourism demand | MBIE ADP public CSV | concrete bounded parser and signal lineage | two real passes succeeded | production source review | locally verified |
| `stats_nz` | Tourism demand | Stats NZ public embedded data | concrete bounded parser and signal lineage | two real passes succeeded | production source review | locally verified |
| `venue_calendars` | Venue events | Auckland Live public JSON | concrete paginated event adapter | two real passes succeeded | additional venue providers | first provider locally verified |
| `council_calendars` | Council events | OurAuckland public HTML | concrete paginated event adapter | two real passes succeeded | additional councils | first provider locally verified |
| `university_calendars` | University events | University of Auckland public JSON | concrete event adapter | two real passes succeeded | additional universities | first provider locally verified |
| `rto_calendars` | Tourism events | ChristchurchNZ public JSON | concrete paginated event adapter | two real passes succeeded | additional RTOs | first provider locally verified |
| `metservice` | Weather disruption | MetService CAP/RSS | concrete feed/detail parser and signal lineage | two real passes succeeded | production source review | locally verified |
| `nzta` | Road disruption | NZTA Journey Planner GeoJSON | concrete bounded parser and signal lineage | two real passes succeeded | production source review | locally verified |
| `airport_data` | Airport flow | Queenstown Airport public JSON | arrivals/departures parser and signal lineage | two real passes succeeded | additional airports | first provider locally verified |
| `port_and_cruise` | Port/cruise flow | Port of Auckland public CSV | cruise parser and signal lineage | two real passes succeeded | additional ports | first provider locally verified |
| `fx_rates` | Exchange rates | RBNZ B1 public page | read-only Browser Worker parser and signal lineage | two real passes succeeded | production source review | locally verified |

## Verified real-source evidence (2026-07-21)

The original three signal-channel acceptance runs enforced one request, at most two records, a
31-day effective window, one concurrent collector, a 10-second request timeout and a 2 MB response
limit. Later source-specific adapters use the same shared guard and evidence contract with their own
explicit request, page, record and response-size bounds.

| Source | Run 1 | Run 2 | Source / canonical / links | Second-pass new rows | Raw evidence | Governance / schedule |
| --- | --- | --- | --- | --- | --- | --- |
| GeoNet | `cmrt9muus0001nv0mxd18i6zd` | `cmrt9n2c90001qr0nrd60nkb5` | 2 / 2 / 2 | 0 | 2 + 2, success TTL 72h | unchanged; schedule disabled |
| Employment NZ holidays | `cmrt9nck20001p40n1ghtcqqd` | `cmrt9niqz0001la0ma2rm452y` | 2 / 2 / 2 | 0 | 2 + 2, success TTL 72h | unchanged; schedule disabled |
| Education school holidays | `cmrt9nozf0001ns0obp7r9pxp` | `cmrt9nvdb0001pf0mibko1rn9` | 1 / 1 / 1 | 0 | 1 + 1, success TTL 72h | unchanged; schedule disabled |
| MBIE ADP | `cmrtcd6q20001ns29z6modqhp` | `cmrtcdd620001ns3s5a82myjx` | 2 / 2 / 2 signals | 0 | bounded raw evidence | unchanged; schedule disabled |
| Stats NZ | `cmrtcsgqa0001uyrefzoejh5t` | `cmrtcsliw0001uyrkt55a1jsc` | 1 / 1 / 1 signal | 0 | bounded raw evidence | unchanged; schedule disabled |
| NZTA | `cmrtcsqrf0001uyrnpcef1kj5` | `cmrtcsujo0001uyrqx0zq4t2d` | 2 / 2 / 2 signals | 0 | bounded raw evidence | unchanged; schedule disabled |
| MetService | `cmrtdbxhv0001uyo7t3blqqxa` | `cmrtdby1f0001uyo9qc9r3pjd` | valid feed / zero active alerts | 0 | feed evidence retained | unchanged; schedule disabled |
| RBNZ B1 FX | `cmrtfb7iz024duytfhprh4uba` | `cmrtfb7jt024puytffkwnppg0` | 2 / 2 / 2 signals | 0 | Browser Worker evidence | unchanged; schedule disabled |
| LINZ Gazetteer | `cmrte990j0001uy3p5wfdlnc5` | `cmrte9gzn0001uy46jb3m8dsp` | 2 raw references / no synthetic signal | 0 | bounded raw evidence | unchanged; schedule disabled |
| Auckland Live | `cmrte9cy40001uy3unr0cdriq` | `cmrte9kqm0001uy4ad44ow9lj` | 2 canonical events | 0 | bounded raw evidence | unchanged; schedule disabled |
| OurAuckland | `cmrte9ech0001uy3yhyllm0w1` | `cmrte9l9q0001uy4cu125winn` | 2 canonical events | 0 | bounded raw evidence | unchanged; schedule disabled |
| University of Auckland | `cmrte99m20001uy3s7gjcxdi7` | `cmrte9hji0001uy48stolqamj` | 2 canonical events | 0 | bounded raw evidence | unchanged; schedule disabled |
| ChristchurchNZ | `cmrte9f180001uy40t109n5ig` | `cmrte9lwk0001uy4e2z3mag4r` | 2 canonical events | 0 | bounded raw evidence | unchanged; schedule disabled |
| Queenstown Airport | `cmrte9g130001uy42k2j80e2j` | `cmrte9mrg0001uy4g0ot34cgr` | 2 / 2 / 2 transport signals | 0 | bounded raw evidence | unchanged; schedule disabled |
| Port of Auckland cruises | `cmrte9ghb0001uy44gsbyqzgl` | `cmrte9n9z0001uy4igwdmktpy` | 1 / 1 / 1 transport signal | 0 | bounded raw evidence | unchanged; schedule disabled |
| Ticketmaster Auckland | `cmrtfdhjc0001mq2ans0flgl0` | `cmrtfdst30001mq3thsa0v9ys` | 2 source series and occurrences / 2 canonical events and occurrences / 2 event and occurrence links | 0 | 3 + 3, success TTL 72h | unchanged; all schedules disabled |

Each source-normalised record points to the second run after refresh. Automated regression also
proves 168-hour parser-failure evidence and time-advanced cleanup; it did not wait 168 elapsed hours.
Redis source-lock contention/reacquisition and PostgreSQL job lease recovery are shared gates rather
than duplicated per adapter.

### Post-Profile all-channel regression

The 2026-07-21 regression reran every implemented channel except Ticketmaster and the unimplemented
OTA placeholders. Each pair below is the source's final two bounded real `localAcceptance` runs.
All 32 runs succeeded with zero failures, `governanceUnchanged=true`,
`schedulesUnchanged=true` and no enabled schedule. Retained success evidence has a 72-hour TTL and
`parserFailure=false`.

| Source | Pass 1 | Pass 2 | Bounded result per pass |
| --- | --- | --- | --- |
| Employment NZ holidays | `cmrtvc1100001rt2a7tomgtkj` | `cmrtvdijv0001rt2g7hqpn2fj` | one valid request; zero current-window records |
| Education school holidays | `cmrtvcdya0001rt3uw6kb00qe` | `cmrtvceyd0001rt567fhwaarg` | one valid request; zero current-window records |
| GeoNet | `cmrtvcfxm0001rt6ih8ejoral` | `cmrtvche30001rt7ujhpcngug` | two disruption signals |
| LINZ Gazetteer | `cmrtvci6q0001rt9554b6b5oj` | `cmrtvcjmh0001rtahf5ytbj9m` | two references; no synthetic signal |
| MBIE ADP | `cmrtvckmn0001rtbt2t0f00qw` | `cmrtvcn8z0001rtd5xst90wtz` | two tourism signals |
| Stats NZ | `cmrtvcpik0001rtehaowsb1yn` | `cmrtvcr050001rtftjqzrnjbx` | one tourism signal |
| Auckland Live | `cmrtvcs220001rth4j6gmvtx4` | `cmrtvct8x0001rtifvex2s9bb` | two events |
| OurAuckland | `cmrtvcu3b0001rtjrqcrfjmiv` | `cmrtvcvpz0001rtl390248x5f` | two events |
| University of Auckland | `cmrtvcx430001rtmey1i43viy` | `cmrtvd1c70001rtnqw5ewv472` | two events |
| ChristchurchNZ | `cmrtvd4r40001rtp27cuxknga` | `cmrtvd6zj0001rtqev0g2x17u` | two events |
| MetService | `cmrtvd98m0001rtrqls4h4p8g` | `cmrtvday60001rtt2pqi5corp` | valid feed; zero active alerts |
| NZTA | `cmrtvdbwe0001rtufnaj2qsxl` | `cmrtvdcxx0001rtvredh1pr4b` | two disruption signals |
| Queenstown Airport | `cmrtvddqh0001rtx4phr9vsvw` | `cmrtvdern0001rtygyfklwqx0` | two transport signals |
| Port of Auckland cruises | `cmrtvdfko0001rtzsmtazsze3` | `cmrtvdh4r0001rt1469u89kxu` | one valid request; zero current-window records |
| Eventfinda | `cmrtvdtez0001rt3s0ek4z1l2` | `cmrtveit00001rt54o6yx0sgg` | one listing plus one detail; 20 discovered; 8 then 3 occurrences from successive frontier targets |
| RBNZ B1 FX | `cmrtvued60001pc29g18073wz` | `cmrtvvphh0001pc3s2pr40jhv` | one browser page; two signals; three artifacts |

RBNZ diagnostics first exposed a retained headed session, a stale Xvfb socket on container restart,
a false positive from the normal `protected by reCAPTCHA` footer and a DOM operation continuing after
the client deadline. The final pair above was executed only after disabling session keep-alive,
hardening Xvfb readiness, narrowing challenge semantics and applying the timeout to the complete
browser task. Both final passes left Browser Worker activity at zero.

Ticketmaster used one Browser Worker request/page, two persisted records, a 31-day effective window,
concurrency one and a 60-second timeout. Both passes discovered 18 public-page events before the
hard record bound was applied. Separate read-only checks succeeded for all five configured city
routes. A two-stage detail-page capture then proved that Ticketmaster's initial verification
interstitial can resolve after a bounded passive wait without interaction. The current Worker now
persists listing discoveries as `SourceCrawlTarget` rows and hydrates exact matching details into the
source/canonical pipeline. Automated two-pass persistence is complete. Real runs
`cmrtsi3ps0001qs41ob7ghc0z`, `cmrtsklsx0001pg2ae0i17xpf` and
`cmrtsnv680001qn2ap5pdojwi` encountered persistent challenges after bounded waits, retained four
failure artifacts per completed capture and entered cooldown without bypassing the challenge. Those
runs predate the challenge-screenshot mechanism; future challenged scheduled captures retain six
artifacts, including initial and settled PNG evidence.

The complete post-change `pnpm verify` gate passed: 81 TypeScript unit/component tests, 34 browser
runtime/extractor/Worker tests, 49 integration tests, lint, all workspace type checks, the 57-route Next.js
production build and all four Worker entrypoint builds. Next.js emitted a non-fatal warning for
LinkeDOM's optional `canvas` module; no calendar parser uses canvas.
