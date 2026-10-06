# Direct event and transport sources

Last reviewed: 2026-10-06. Current operating evidence is in [traceability](../traceability.md).

Tymra directly collects Eventbrite New Zealand, Humanitix New Zealand and Christchurch Airport
without Argus. All development schedules are seeded disabled.

## Eventbrite and Humanitix

- Christchurch jobs use each platform's city route; national jobs retain the New Zealand route.
- Bounded pagination deduplicates stable occurrence IDs and stops as soon as the next page adds no
  records. This is important because both platforms may ignore or partially repeat a `page` query.
- Listing requests read browser-visible schema.org JSON-LD.
- Complete listing records are normalized without opening one detail page per event.
- Stable source series and occurrence IDs include the canonical source URL and start time.
- Venue, address, status, offers, organizer, performers, images and description are retained when
  present. Impact remains `PENDING_EVIDENCE` until attendance or capacity evidence exists.
- Each accepted listing record reports one avoided detail request for collection-efficiency metrics.

## Airport and port transport flow

- Four public JSON views cover arrivals/departures and domestic/international flights.
- Flight number, airline, route, scheduled/estimated time, gate and status are retained.
- Arrivals produce positive transport-flow evidence, departures are mixed, and cancellations are
  negative. These are operational signals, not direct causal price claims.
- Wellington Airport is collected from its official server-rendered arrivals/departures board with
  bounded day and record limits. Scheduled/estimated time, route, flight, airline, gate and remarks
  are retained; delays and cancellations become negative disruption-aware flow signals.
- Queenstown Airport flights are routed to the canonical `queenstown-wanaka` market. Ports of
  Auckland cruise calls provide the additional Auckland flow layer.

## Christchurch demand channels

- `christchurch_sports` reads official Crusaders, Mainland Tactix and Canterbury Cricket fixture
  pages. It keeps Christchurch home fixtures and does not open one detail page per match.
- `christchurch_university_dates` reads demand-relevant University of Canterbury dates through
  direct HTTP and Lincoln University annual key dates through Argus because Lincoln returns HTTP 403
  to ordinary collection. Both enter the same standard signal and lineage pipeline; Lincoln's
  administrative, other and unresolved rows remain raw and are not promoted.
- `christchurch_racing` reads Addington's visible race calendar and Riccarton Park's official New
  Zealand Cup Week dates.
- `christchurch_cruise` discovers ChristchurchNZ's public Power BI report, reuses its published
  semantic query, and reads the public report JSON endpoint. Port, arrival/departure date and time,
  ship and published guest capacity are retained for Lyttelton and Akaroa calls.
- `christchurch_airport_monthly` reads the official domestic, international and total monthly
  passenger table. These are historical capacity signals and remain distinct from live flights.

All five source groups are registered in Data Explorer and collection control. Their development
schedule definitions are seeded disabled.

## Nationwide regional official calendars

Tymra directly collects official calendars for Wellington, Hamilton/Waikato, Queenstown/Wānaka,
Taupō, Southland/Fiordland, Hawke's Bay, Taranaki, Nelson/Tasman, Tauranga, Manawatū, Northland and Rotorua.
They use bounded public HTML, JSON, GraphQL or public APIs identified from the official calendar.
Together with the established Auckland and Christchurch sources, direct collection covers 14 of 15
major accommodation markets. Dunedin requires Argus; the executable definition, live
contract and evidence are in
[`nz-market-public-signal-coverage.md`](nz-market-public-signal-coverage.md).

## Christchurch priority coverage

- `christchurch_council_events` uses Argus's fixed headed public Profile for the official
  Christchurch City Council What's On listing. At most three same-route pages supply the
  title, advertised date, image and canonical event URL; Tymra keeps the existing occurrence
  identity and deduplication. No event detail is opened. A challenge or empty listing stops
  collection. Actual production state is recorded in [traceability](../traceability.md).
- `ara_academic_dates` reads Ara's official academic calendar. Semester starts/ends, mid-year break
  and Christchurch graduation dates become `TOURISM_DEMAND` signals. Timaru-only, registration,
  campus-closure and small campus ceremony rows remain unpromoted.
- `canterbury_major_annual_events` reads stable official pages for the Ravensdown Canterbury A&P
  Show and ASICS Christchurch Marathon. An event is promoted only when its current official page
  publishes sufficient scale evidence. Use the observed edition's explicit scale and date evidence; neither an old year's
  attendance nor a source's existence establishes current promotion.

These sources have independent registry entries, raw artifacts, lineage and collection controls.
Their weekly/12-hour production candidates are seeded disabled in development.

School Sport NZ, School Sport Canterbury and Ticketek are not Tymra direct sources: ordinary HTTP
currently does not provide the required structured response. Their work is assigned to Argus and is
documented in [`argus.md`](argus.md). Tymra now registers all three sources, submits the fixed
contracts through durable Argus Jobs, retains raw connector output, copies and verifies evidence
before ACK, and normalises accepted series and occurrences through the canonical event and lineage
pipeline. Administrative School Sport rows and rows without an explicit published location remain
raw; source organisation is never used to invent a Canterbury location. All four development
schedules are seeded disabled. Tymra safely retains Ticketek evidence and keeps listing events when
detail enrichment fails. A known challenge must be classified and retained, never bypassed. Current Ticketek
availability must be checked against its actual production evidence, not an August development run.

## Verification

The parser contract suite covers every direct source and its source-specific boundary. Run
`LIVE_SOURCE_PROBE=1 pnpm exec vitest run packages/providers/test/worker-adapters.test.ts` for a
bounded real-source probe. Run `pnpm accept:public` with the scheduler disabled for the
two-pass database and lineage acceptance.

Dated real transport and two-pass evidence is indexed in [evidence](../evidence/README.md).
Use the requested dates and the source's actual publication period; old cruise seasons or monthly
statistics are not rolled forward into future observations. Parser success is separate from
freshness, complete market coverage and scheduled production acceptance.
