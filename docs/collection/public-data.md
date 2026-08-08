# Non-OTA public collection

Last updated: 2026-08-06

## Request strategy

Non-OTA collection uses the smallest authoritative public representation. A list, feed or dataset is
not followed by a detail request when it already contains the fields needed by the normaliser.

| Source | Network shape | Detail policy |
| --- | --- | --- |
| Employment NZ holidays | One HTML page, weekly | No detail pages |
| Ministry of Education school holidays | One HTML page, weekly | No detail pages |
| GeoNet | Two GeoJSON requests | Earthquakes and volcanic alert levels; no detail requests |
| MBIE accommodation data | One bounded CSV range request | No detail requests |
| MBIE Tourism Volumes & Flows | One XLSX request | Latest 13 monthly RTO periods; total-visitor series only |
| MBIE MRTE | One summary XLSX request | RTO monthly spend and source-published YoY changes |
| MBIE IVS | One aggregate JSON request | Rolling-annual national spend/visitor context; no microdata download |
| Stats NZ international travel | One HTML page with embedded data | No detail pages |
| NZTA Journey Planner | One GeoJSON request | No detail requests |
| DOC recreation alerts | Fourteen official regional JSON requests | Keep only closures, unsafe/no-access and equivalent accommodation-relevant destination alerts; deduplicate repeated place notices |
| Interislander | One official service-alert JSON request | Current alerts route to Wellington and Nelson/Tasman; no booking or sailing-detail requests |
| Official ski seasons | Three official resort HTML pages | Exact season windows for The Remarkables, Mt Hutt and Whakapapa; explicitly weather-dependent |
| MetService CAP | One RSS index plus changed CAP alerts | Skip an alert detail when its URL, GUID and publication time match the stored version; fetch new or updated versions |
| RBNZ exchange rates | One Argus browser Job | No detail pages |
| Auckland Airport monthly passengers | One Argus browser Job | Fixed monthly domestic/international/total contract; no terminal or flight details |
| Ministry of Transport airline performance | One Argus browser Job | Fixed route/month contract; preserve voluntary and incomplete-coverage caveat |
| University of Auckland | One JSON event list | The list record is authoritative |
| Auckland Live | Paginated JSON event search | Performances and dates are expanded from each list record; no show detail page |
| OurAuckland | One read-only Argus browser listing Job plus selected details | Explicit occurrences and field provenance are persisted from the fixed connector contract |
| ChristchurchNZ | Paginated JSON event list | All sessions are expanded from each list record; no event detail page |
| Queenstown Airport | Arrivals and departures JSON feeds plus public Power BI monthly passengers | No flight detail pages; monthly domestic/international/total series stays separate |
| Wellington Airport | Server-rendered flight board plus monthly XLSX workbook | No flight detail pages; monthly totals remain a distinct lagged demand series |
| Port of Auckland cruise schedule | One CSV request | No vessel detail pages |
| LINZ Gazetteer | One query per configured market term | Reference data only; no event or demand signal is invented |

Eventfinda and Ticketmaster have source-specific collection strategies documented separately.

Source escalation remains source-specific. OurAuckland and RBNZ B1 use existing Argus connectors.
DunedinNZ, Auckland Airport monthly traffic and Ministry of Transport airline on-time performance
require new Argus connectors because their authoritative pages or report assets do not provide the
required structured response through ordinary HTTP. Tymra's registry, disabled schedules, strict response contracts,
normalisers, market routing, persistence and price-analysis lineage for all three are already present.

The two holiday calendars change slowly, so their schedules run weekly instead of daily. This
reduces those requests from 14 to 2 per week. Eventfinda nationwide discovery runs daily instead of
twice daily; its separate hourly detail pass only opens targets that are actually due.

## Cross-source deduplication

The Worker applies four bounded deduplication stages:

1. Duplicate discovery references are requested once.
2. Raw records with the same source external ID are normalised once per run.
3. Normalised signals and occurrences with the same source external ID are persisted once per run.
4. An unchanged stored signal or occurrence only updates its collection run and `lastSeenAt`; it does
   not rebuild the canonical signal/event, venue and lineage links.

The effective date range, record ceiling and Adapter request ceiling are passed to every collection
mode, not only local acceptance. Paginated list/API collectors therefore filter against the requested
window and stop at their bounded request or record limit instead of falling back to an unbounded
default scan.

For a multi-date event, one source series and one canonical event are shared across every occurrence
in the batch. A canonical venue is also reused when its exact venue key is unchanged. Each advertised
date remains a separate `SourceEventOccurrence` and `EventOccurrence`.

Collection-run counters expose `requestsAvoided`, `duplicatesSkipped`, `unchangedSkipped`,
`unchangedSignalsSkipped`, `unchangedEventsSkipped` and `unchangedDetails` where applicable.

## Retry policy

Transient source, rate-limit, timeout and unknown infrastructure failures may retry within the job's
attempt budget. Configuration, input, range and parser-contract failures are terminal and are
not repeated. The Worker also recovers expired job leases periodically while running; recovery no
longer depends on a process restart.

All schedules remain controlled by source operational state and are hard-disabled in development.

## Current status

The implementation exposes one development-only acceptance runner for the configured non-OTA
public sources. It fixes one 31-day window, runs each selected source twice with source-specific bounds
and `maxAttempts=1`, verifies source/canonical lineage, requires zero enabled schedules, checks that
source configuration remains unchanged and rejects second-pass source/link growth. The nationwide expansion
and latest isolated persistence evidence are recorded in the
[2026-08-06 acceptance record](../evidence/nz-major-market-public-signals-acceptance-2026-08-06.md).
