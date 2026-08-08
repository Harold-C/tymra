# Direct event and transport sources

Last updated: 2026-08-06

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
They use bounded public HTML, JSON, GraphQL or public APIs discovered from the official calendar.
Together with the established Auckland and Christchurch sources, direct collection covers 14 of 15
major accommodation markets. Dunedin requires Argus; the executable definition, live
evidence and handoff are in
[`nz-market-public-signal-coverage.md`](nz-market-public-signal-coverage.md).

## Christchurch priority coverage

- `christchurch_council_events` pages through Christchurch City Council What's On and extracts the
  title, advertised date, image and canonical event URL from list cards. It does not open event
  details, so a full pass costs one request per listing page rather than one request per event.
- `ara_academic_dates` reads Ara's official academic calendar. Semester starts/ends, mid-year break
  and Christchurch graduation dates become `TOURISM_DEMAND` signals. Timaru-only, registration,
  campus-closure and small campus ceremony rows remain unpromoted.
- `canterbury_major_annual_events` reads stable official pages for the Ravensdown Canterbury A&P
  Show and ASICS Christchurch Marathon. An event is promoted only when its current official page
  publishes sufficient scale evidence. The 2026 Show publishes 70,000 annual visitors, 400 trade
  sites and 5,000 show events/competitions; the Marathon remains pending until current attendance
  evidence is available.

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
detail enrichment fails. Argus now has the hidden-`show.aspx` classifier regression, but the 2026-08-06
real two-pass run was still intermittent: pass one completed, while pass two returned a detail
`PARSING_ERROR`; both preserved evidence and added no duplicate rows. Real-detail robustness therefore
remains an Argus item and no bypass is attempted; see [`argus-responsibilities.md`](argus-responsibilities.md).

## Verification

The parser contract suite covers every direct source and its source-specific boundary. Run
`LIVE_SOURCE_PROBE=1 pnpm exec vitest run packages/providers/test/worker-adapters.test.ts` for a
bounded real-source probe. Run `pnpm accept:public` with the scheduler disabled for the
two-pass database and lineage acceptance.

The 2026-08-04 real-source probe passed all 37 tests, including every new Christchurch channel.
Two-pass database acceptance persisted representative platform events, sports events, university
signals, racing events and airport monthly signals; second passes added zero source, canonical or
lineage rows. The cruise adapter decoded 69 public dashboard rows in the live probe. Parser failures
and active Argus executions were zero, and enabled schedule count remained zero.

On 2026-08-06, the Wellington Airport live probe produced 40 bounded Wellington transport-flow
signals from one request. Isolated acceptance
`public-sources-2026-08-06T00:30:31.202Z-3880bb97` passed twice: the first pass persisted two current
signals and the second reported both unchanged with zero new source or lineage rows.

At verification time ChristchurchNZ still labelled the public cruise report `2025/2026 Season`.
The adapter decoded that report but correctly returned no future cruise occurrences for August
2026 onward. Source freshness is visible in collection results and historical fixture acceptance;
Tymra does not roll old calls forward or invent a 2026/27 schedule.
