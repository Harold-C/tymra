# New Zealand major-market public-signal coverage

Last updated: 2026-08-06

## Completion definition

The public-signal phase covers 15 major accommodation markets. Core market coverage requires:

1. nationwide event discovery from Eventfinda, Ticketmaster, Eventbrite, Humanitix and Ticketek;
2. at least one official local destination, council or venue calendar;
3. MBIE accommodation occupancy, Tourism Volumes & Flows, Monthly Regional Tourism Estimates and
   International Visitor Survey data, plus Stats NZ international-travel context; and
4. nationwide holidays, school holidays, MetService, NZTA, GeoNet, DOC destination alerts,
   Interislander service alerts, Ministry of Transport airline performance and FX disruption/context inputs; and
5. official ski-season windows for Queenstown/Wānaka, Christchurch and Taupō, where this is a
   material deterministic demand season.

Every formal analysis executes the complete source plan for its canonical market: all five
nationwide discovery sources, the market's official calendars, all five demand sources, all nine
disruption/context sources, every applicable seasonal source and every registered local-flow source. The resulting per-source
success/failure summary is frozen into the date snapshot, market snapshot, price analysis and
published result. Missing or failed sources are explicit data gaps rather than silent omissions.

Airport, port and cruise feeds are an additional depth layer where a stable public source exists.
They do not block core completion for an inland market or a market without a public operational feed.
An event remains `PENDING_EVIDENCE` and cannot affect price advice until the separate event-impact
gate has qualified attendance evidence, or independently sourced official-scale and
accommodation-demand evidence. Venue capacity or duplicate publication alone is insufficient.

## Market matrix

| Market | Official local source in Tymra | Local flow depth | State |
| --- | --- | --- | --- |
| Auckland | Auckland Live, OurAuckland, University of Auckland | Ports of Auckland/cruise plus verified Auckland Airport monthly passengers | Core and airport depth implemented |
| Wellington | WellingtonNZ | Wellington Airport live flights and monthly passengers | Core implemented |
| Christchurch | ChristchurchNZ, Te Pae, Venues Ōtautahi, Isaac Theatre Royal, CCC, sport/racing/annual-event sources | airport, monthly passengers, cruise | Core implemented |
| Queenstown/Wānaka | Destination Queenstown plus The Remarkables ski season | Queenstown Airport live flights and monthly passengers | Core implemented |
| Rotorua | RotoruaNZ What's On | None registered | Core implemented |
| Tauranga/Mount Maunganui | Tauranga City Council-managed What's On | None registered | Core implemented |
| Hamilton/Waikato | Hamilton & Waikato Tourism public API | None registered | Core implemented |
| Dunedin | DunedinNZ via the registered Argus connector | None registered | Core path implemented through Argus |
| Nelson/Tasman | Nelson Regional Development Agency featured calendar plus national Eventfinda depth | None registered | Core implemented |
| Hawke's Bay | Hawke's Bay Tourism | None registered | Core implemented |
| Taranaki | Venture Taranaki GraphQL | None registered | Core implemented |
| Taupō | Destination Great Lake Taupō plus Whakapapa ski season | None registered | Core implemented |
| Northland | Whangārei District Council What's On plus national discovery for Bay of Islands/Far North | None registered | Core implemented |
| Manawatū | Central Economic Development Agency | None registered | Core implemented |
| Southland/Fiordland | Great South | None registered | Core implemented |

The direct-adapter-only `assessNzMarketCoverage` report remains 14 of 15 and identifies Dunedin as
Argus-required by design. The separate registered Argus path is now live, so all 15 markets have an
implemented official-calendar collection path; this does not imply operational stability.

## Nationwide address coverage hierarchy

Once an enabled identity provider has resolved a New Zealand property into structured country and
locality fields, Tymra no longer rejects addresses outside the 15 major markets or assigns them to
Christchurch. `resolveNzAddressSignalCoverage` produces one explicit level:

- `FULL`: one of the 15 configured major markets; the complete national, official-local, seasonal
  and registered local-flow plan applies.
- `REGIONAL`: a recognised New Zealand region outside an unambiguous major-market mapping; the
  19-source national discovery, demand and disruption baseline applies, regional MBIE and
  text-addressed MetService/NZTA/GeoNet/event signals use an `nz-region-*` key, and missing official
  local-event/local-flow sources are declared limitations.
- `NATIONAL_ONLY`: the property is confirmed as New Zealand but its region is unresolved; only
  `new-zealand` signals are queried and no regional or local coverage is implied.

All 17 official region names, including Gisborne, Marlborough, West Coast and Chatham Islands, map
to a non-null coverage result. Explicit non-New-Zealand countries fail closed. The resolved level,
market name and limitations are frozen into the competitor set, date/market snapshots and result
payload, and are shown in both secure result experiences.

Free-text street-address discovery now uses the official LINZ NZ Addresses ArcGIS Feature Service
through the unified `AddressIdentityProvider`. It returns the normalized address, town/city,
Territorial Authority, derived Region and RTO, explicit postcode when available, WGS84 coordinates
and a confidence score. Web and Worker use a process L1 plus a shared PostgreSQL L2 cache protected
by a Redis miss lock. The database stores only an HMAC query fingerprint, resolver version, canonical
public identities and ordered candidates; it never stores the raw search query. UNIQUE, MULTIPLE and
NONE results expire after 7 days, 24 hours and 1 hour respectively. Multiple credible candidates
require confirmation; low-confidence results are not selected; and an explicit Region in the query
removes candidates from another Region. Search candidates stay outside Property/SellableUnit until
the user confirms one or a Worker starts real work from a unique identity. The coverage router still
does not silently substitute the nearest major market when structured geography is unavailable.

Implementation coverage and operational stability are deliberately separate. The executable
`assessNzMarketOperationalCoverage` gate requires, per market:

- at least three fresh nationwide discovery sources;
- one fresh official regional source, or two for Christchurch's deeper source set;
- fresh MBIE ADP, Tourism Volumes & Flows and MRTE evidence routed to that exact canonical market,
  plus fresh Stats NZ and IVS national context;
- both holiday calendars, at least one fresh real-time disruption source and four fresh disruption/context sources in total;
- every registered official seasonal source for that market; and
- an 80% or better success rate when a source has at least three attempts in the preceding 72 hours;
- at least two distinct UTC days with successful collection runs; and
- a fresh local transport-flow source when one is registered for that market.

Freshness follows the registered cadence: 30 hours for event sources, 216 hours for weekly sources,
30 minutes for MetService, three hours for high-frequency transport/GeoNet sources and 36 hours for
daily context sources. The daily market-coverage refresh persists the layer result, healthy sources
and stale/missing sources in `MarketCoverage.region.publicSignalOperations`. Consequently, the 14
direct markets are **implemented**, but are not described as operationally stable until enabled,
enabled schedules have produced the required runtime evidence.

`pnpm --filter @tymra/worker soak:nz-public-signals` provides the resumable unattended gate. It runs
two-pass acceptance on each cycle, records capacity and failure rate in a checkpoint, defaults to
three daily cycles, and refuses to label repeated same-day successes as multi-day stability.

## Bounded live evidence

The 2026-08-06 development probes used ordinary read-only HTTP, a bounded future window and source
limits. They proved current transport and parser compatibility, not multi-day production stability.

| Source | Records observed | Requests used in probe |
| --- | ---: | ---: |
| WellingtonNZ | 9 | 1 |
| Hamilton & Waikato Tourism | 20 bounded | 1 |
| Destination Queenstown | 4 | 2 |
| Destination Great Lake Taupō | 20 bounded | 1 |
| Great South | 12 | 2 |
| Hawke's Bay Tourism | 200 bounded | 1 |
| Venture Taranaki | 20 bounded | 1 |
| Nelson/Tasman | 4 featured | 1 |
| Tauranga What's On | 13 | 1 |
| CEDA Manawatū | 30 bounded | 3 |
| Whangārei District Council | 6 | 1 |
| RotoruaNZ What's On | 20 bounded | 1 |
| MBIE Accommodation Data Programme | 18 regional records / 19 canonical signals | 1 |
| Wellington Airport | 40 bounded flight signals | 1 |
| Wellington Airport monthly passengers | 3 latest months; April 2026 total 399,346 / YoY -7.00% | 2 |
| MBIE Tourism Volumes & Flows | 234 recent RTO signals / all 15 markets | 1 |
| MBIE Monthly Regional Tourism Estimates | 18 RTO signals / all 15 markets | 1 |
| MBIE International Visitor Survey | 5 rolling-annual signals; latest spend NZ$13.73b / YoY +12.19% | 1 |
| Queenstown Airport monthly passengers | 13 months; June 2026 total 184,282 / YoY +5.94% | 6 |
| DOC regional recreation alerts | 143 accommodation-relevant active alerts / 178 signals / all 15 markets | 14 |
| Interislander service alerts | 1 current alert / Wellington and Nelson-Tasman | 1 |
| Official ski seasons | 3 season windows / Queenstown-Wānaka, Christchurch and Taupō | 3 |

Auckland and Christchurch direct-source evidence predates this expansion and remains covered by
their existing parser, worker and acceptance suites. Every new direct source is registered with a
disabled-by-default development schedule, request budget, configuration metadata and two-pass
acceptance specification.

The isolated two-pass persistence acceptance on 2026-08-06 covered 27 sources and 54 passes with no
failures, no repeat-row growth, no schedule mutation and no active Argus executions. The detailed
evidence and the two runtime defects fixed during that acceptance are recorded in
[`nz-major-market-public-signals-acceptance-2026-08-06.md`](../evidence/nz-major-market-public-signals-acceptance-2026-08-06.md).
Separate isolated acceptances then proved MBIE canonical routing to every one of the 15 markets and
Wellington Airport's direct transport-flow persistence; both second passes added zero rows.
An additional isolated acceptance (`public-sources-2026-08-06T01:28:37.708Z-45d76c04`) persisted
234 TVF, 18 MRTE and 5 IVS records/signals per pass. Both regional datasets contained all 15
canonical markets, every second pass was unchanged, and no Argus execution or schedule mutation
occurred. The temporary database was removed after verification.
Queenstown Airport monthly acceptance
`public-sources-2026-08-06T01:41:21.594Z-c3d49e15` persisted 13 monthly signals per pass with
six requests and zero second-pass growth. Nationwide access-alert acceptance
`public-sources-2026-08-06T01:51:28.119Z-e33c390d` persisted 178 DOC signals and two
Interislander signals, with zero second-pass growth and no Argus executions. Ski-season acceptance
`public-sources-2026-08-06T01:57:23.892Z-41bf5e5b` persisted all three official season windows and
was also unchanged on pass two. Every temporary database was removed after verification.

The current development database then passed the complete 50-source direct set twice under
acceptance `public-sources-2026-08-06T02:15:04.698Z-02faded4`. That artifact is cycle 1 of the
resumable direct-source soak checkpoint. `SOAK_CYCLES_PER_INVOCATION=1` allows the exact source set
to be continued on a later UTC day without a long-lived 24-hour process; imported artifacts must be
complete, passed, failure-free and internally consistent before they are accepted as evidence.

## Pricing-decision integration

Tymra resolves the confirmed property's city/territorial authority/RTO to one canonical market key
before collecting or querying public signals. Region-only values that could refer to multiple major
markets, such as Otago or Bay of Plenty, are rejected instead of guessed.

Only promoted `MAJOR_EVENT` records contribute to event impact. Holiday, tourism-demand and
transport-flow signals contribute separately to demand pressure; weather/access records contribute
separately to accessibility, displacement and stranded-traveller effects. Date snapshots retain the
source signal IDs, and price analyses retain the combined event signal IDs and affected dates. A
major-event reason code can corroborate an existing comparable-rate recommendation, but a public
signal by itself never creates a price-change recommendation.

MBIE RTO/territorial-authority names are mapped explicitly to the 15 canonical market keys. ADP,
TVF and MRTE remain distinct demand series; Queenstown/Wānaka and Southland/Fiordland sub-regions
are not incorrectly summed. For a future stay, pricing selects only the latest observation per
source series. Monthly signals use a 120-day context window, while IVS declares a 400-day window
appropriate to a rolling-annual quarterly release.
Official ski-season records are exact date windows and are never carried forward after the published
closing date; their positive demand context applies only while the stay date overlaps the season.
The formal isolated 30-day pricing test asserts this carry-forward for every generated date snapshot.

Regional anniversary days, MetService CAP warning areas, NZTA road-event text/geometry and GeoNet
earthquake coordinates are routed to affected canonical markets instead of being persisted as
blanket New Zealand signals. GeoNet's official API adapter also collects active Volcanic Alert
Levels; level-zero records remain raw evidence only, while active unrest is routed by volcano
coordinate and a bounded impact radius. A healthy national feed with no current signal for a market
still counts as a successful collection—the absence of an active warning is not a source failure.

All event persistence paths now run the same impact publisher. Qualified evidence from exact
cross-source matches is merged on the canonical occurrence under `event-impact-promotion-v2`;
independent official-scale and accommodation-demand evidence can promote, while same-host claims,
capacity alone and repeated listings cannot. The publisher uses one canonical signal per occurrence,
retains all source lineage, and retracts a previous signal if the aggregate evidence no longer passes.
An isolated PostgreSQL integration test proved the two-source merge, unique signal, two lineage links
and pricing-visible `MAJOR_EVENT` state on 2026-08-06.

## Argus integration status

Tymra has the source identities, disabled schedules, scope validation, durable Job submission, fixed
v1 response schemas, named-download retention, normalisation, canonical-market routing,
deduplication and persistence for all three browser connectors. Argus has registered all three:

1. `dunedinnz-public / collect_events` passed two Tymra Jobs in a valid quiet window with retained
   evidence, ACK/410 and zero repeat growth.
2. `mot-airline-performance / collect_monthly_performance` passed two Tymra Jobs with 100 bounded
   records, 147 routed signals, named workbook evidence and all 147 signals unchanged on the repeat
   pass.
3. `auckland-airport-monthly / collect_monthly_traffic` passed two real browser-click persistence
   runs. Each returned 13 bounded months and 13 signals; the repeat pass skipped all 13 as unchanged.
   HTML, screenshot and the named XLSX passed local SHA-256 verification and ACK/410. The latest
   trustworthy month is `2026-05`; the source's malformed `2006-06` final row remains excluded rather
   than being inferred as June 2026.

Argus completion is accepted only when the connector passes its schema test, one bounded real Job,
copy-before-ACK evidence verification, persistence, and a second identical pass with zero new event
or lineage rows.
