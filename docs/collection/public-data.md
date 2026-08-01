# Non-OTA public collection

Last updated: 2026-08-01

## Request strategy

Non-OTA collection uses the smallest authoritative public representation. A list, feed or dataset is
not followed by a detail request when it already contains the fields needed by the normaliser.

| Source | Network shape | Detail policy |
| --- | --- | --- |
| Employment NZ holidays | One HTML page, weekly | No detail pages |
| Ministry of Education school holidays | One HTML page, weekly | No detail pages |
| GeoNet | One GeoJSON request | No detail requests |
| MBIE accommodation data | One bounded CSV range request | No detail requests |
| Stats NZ international travel | One HTML page with embedded data | No detail pages |
| NZTA Journey Planner | One GeoJSON request | No detail requests |
| MetService CAP | One RSS index plus changed CAP alerts | Skip an alert detail when its URL, GUID and publication time match the stored version; fetch new or updated versions |
| RBNZ exchange rates | One Argus browser Job | No detail pages |
| University of Auckland | One JSON event list | The list record is authoritative |
| Auckland Live | Paginated JSON event search | Performances and dates are expanded from each list record; no show detail page |
| OurAuckland | One read-only Argus browser listing Job | Date-precision events are persisted from cards; no event detail page |
| ChristchurchNZ | Paginated JSON event list | All sessions are expanded from each list record; no event detail page |
| Queenstown Airport | Arrivals and departures JSON feeds | No flight detail pages |
| Port of Auckland cruise schedule | One CSV request | No vessel detail pages |
| LINZ Gazetteer | One query per configured market term | Reference data only; no event or demand signal is invented |

Eventfinda and Ticketmaster have source-specific browser strategies documented separately.

OurAuckland is the only official calendar in this table that currently requires a browser: ordinary
HTTP requests from the development container receive a 403, while the official RSS omits event
occurrence dates. Tymra therefore submits the bounded listing page to Argus and consumes its
structured, read-only result. This is a source-specific escalation, not a rule to move JSON, CSV,
RSS or directly accessible HTML transports into Argus.

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
attempt budget. Rights, configuration, input, range and parser-contract failures are terminal and are
not repeated. The Worker also recovers expired job leases periodically while running; recovery no
longer depends on a process restart.

All schedules remain controlled by source governance and are disabled in local development.

## Current status

The implementation currently exposes one development-only acceptance runner for all 17 configured
non-OTA public sources. It fixes one 31-day window, runs each selected source twice with `limit=2`
and `maxAttempts=1`, verifies source/canonical lineage, requires zero enabled schedules, checks that
governance remains unchanged and rejects second-pass source/link growth. Its latest complete real
run remains the immutable [2026-07-30 acceptance record](../evidence/public-source-acceptance-2026-07-30.md).

On 2026-08-01 the runner code, Worker typecheck, Worker build and unit tests passed, but the real
17-source runner and database integration suite were not rerun. Therefore external availability and
two-pass real persistence remain supported by the dated acceptance record, not a fresh live claim.
