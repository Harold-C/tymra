# Argus collection responsibilities

## Boundary

Tymra has no browser runtime. Tymra may collect a source only when the required data is available through ordinary read-only HTTP requests and can be parsed without executing page JavaScript. Any source requiring browser rendering, browser cookies, interactive navigation, challenge handling, or screenshot evidence belongs in Argus.

Argus returns source-specific raw evidence. Tymra owns source governance, job orchestration, raw-artifact retention after transfer, normalisation, lineage, deduplication, monitoring, and application-facing standard tables.

## P0: platform readiness

- Restore Argus as an always-on required development dependency at `api.argus.test`.
- Provide separate liveness and readiness endpoints. Readiness must prove that the queue, browser runtime, evidence storage, and worker are usable.
- Expose connector/version inventory and active capacity so Tymra can show it in collection monitoring.
- Preserve evidence until Tymra has copied and verified it, then accept an explicit ACK before deleting or expiring the Argus copy.
- Support cancellation and restart recovery without leaving executions permanently active.
- Return stable error classes: challenge, blocked, timeout, navigation, parsing, invalid input, cancelled, and internal failure.

## Existing browser connectors

### Ticketmaster New Zealand

- Accept only selective detail URLs that Tymra's direct-HTTP listing collector marks incomplete.
- Detect cancelled detail pages and return `CANCELLED`; do not continue ticket/price enrichment for a cancelled occurrence.
- Deduplicate shared event pages and do not perform separate listing discovery in Argus.
- On every challenge or block, save a full-page screenshot, visible text, final URL, response status, challenge type, timestamp, browser mode, and connector version before cooldown/circuit-breaker handling.
- Keep the current conservative concurrency, cooldown, challenge circuit breaker, and manual evidence review path.

### RBNZ B1 exchange rates

- Own the browser-based table extraction while the source cannot be collected by Tymra through a stable ordinary HTTP representation.
- Return the complete table payload, page date, source URL, and extraction evidence using the shared ACK lifecycle.

### OurAuckland listing and detail collection

- Own current listing and detail collection because ordinary HTTP requests receive the source's access-control response.
- Return listing candidates and one event series per selected detail, with explicit occurrences, venue, category, cost, booking, contact, images, and field-level provenance.

## Additional Argus connectors

### Ticketek New Zealand

- Argus has implemented listing discovery followed by selective detail enrichment under
  `ticketek-public.collect_listing@1.0.0` and `ticketek-public.collect_detail@1.0.0`.
- Return event identity, occurrence dates/times, venue, city, status, ticket state, category, images, and canonical URL.
- Include challenge evidence and the same cooldown/circuit-breaker contract as Ticketmaster.

Ordinary HTTP verification on 2026-08-04 returned an Akamai `403 Access Denied` response for
`https://www.ticketek.co.nz/` and timed out without a response for the Premier What's On route.
Ticketek therefore must not be implemented as a Tymra HTTP adapter or browser fallback.

The embedded-performance parser regression passed against a retained real page, including four
separate performances with time and location. A fresh cross-service run on 2026-08-05 found that the
current Argus classifier recognises the Akamai shape only after navigation to `detection.aspx`; the
real challenged detail retained `show.aspx` as its final URL and was therefore still returned as
`PARSING_ERROR`. Tymra preserves the ten listing records and seven canonical events, marks the run
`PARTIAL`, retains both executions' HTML/screenshots before ACK, and never attempts a bypass. Detail
live acceptance remains blocked on the Argus classification fix. Production schedules remain disabled.

### School Sport NZ and School Sport Canterbury

- Argus has implemented one Sporty-based browser connector,
  `sporty-school-sport-public.collect_events@1.0.0`, with two allowlisted entry points:
  `https://www.sporty.co.nz/SSNZ/Sport-1/Events` and
  `https://www.sporty.co.nz/sscanterbury`.
- Preserve the source organisation on every record; do not merge national and Canterbury listings
  inside Argus.
- Return tournament or event name, sport, gender/grade where published, venue, locality, start/end
  date, status, canonical URL, source-updated value, and field-level provenance.
- Model one tournament as a series and each independently advertised date/location as an occurrence.
- Prefer calendar/list data and open details only when required fields are missing. Deduplicate
  shared detail URLs before navigation.
- Classify Canterbury-hosted events explicitly so Tymra can retain national records while only
  promoting Christchurch/Canterbury accommodation demand.
- Use conservative serial collection, persisted session state, bounded navigation, randomised
  human-scale delay, cooldown and circuit breaker. Save challenge evidence before retry/cooldown.

Ordinary HTTP verification on 2026-08-04 returned Cloudflare `403` challenge pages for both Sporty
entry points, so these sources belong entirely in Argus.

Bounded Argus runs returned 20 records from each source with stable IDs and retained evidence.
Tymra now integrates the Connector for both source identities. School Sport Canterbury also contains
administrative calendar rows and sparsely located records, so Tymra retains the raw payload but
promotes only non-administrative, explicitly located rows marked Canterbury-hosted. It never infers
location from the organisation name.

The complete handoff, Job IDs, hashes and remaining execution order are recorded in
[`non-ota-collection-task-archive-2026-08-05.md`](../evidence/non-ota-collection-task-archive-2026-08-05.md).

### Conditional browser connectors

Additional sources enter Argus only after a direct-HTTP probe shows that required data is not available without browser execution.

Lincoln University key dates were integrated on 2026-08-04. Tymra submits the fixed annual page through connector `lincoln-university-key-dates`, workflow `collect_key_dates`, and accepts only `lincoln-university-key-dates.collect_key_dates@1.0.0`. Tymra repeats complete field-level validation before normalisation. Resolved demand-relevant dates become `UNIVERSITY_CALENDAR` signals under `christchurch_university_dates`; administrative, other and unresolved dates remain in retained evidence and the persisted Argus result but are not promoted.

Lincoln evidence follows the shared copy-before-ACK lifecycle. The bounded database acceptance requires one Argus execution per pass, at least one local `tymra-evidence:` artifact, zero remaining remote `argus-evidence:` references, at least one Lincoln signal, and zero second-pass source or lineage growth.

Tymra directly handles Christchurch sports fixtures, UC dates, Addington/Riccarton dates, the ChristchurchNZ public Power BI cruise report, and Christchurch Airport monthly passenger tables.

## Argus response contract

Each execution must return:

- `executionId`, connector key/version, source URL, canonical/final URL, started/finished timestamps, browser mode, and status.
- Request/page counters and whether each record came from listing or detail evidence.
- Raw HTML or structured browser capture, plus content hash and media type.
- Source-specific records with stable source IDs and explicit series/occurrence relationships.
- Evidence references for screenshots and unexpected pages.
- Challenge classification, cooldown-until value, retryability, and circuit-breaker state when applicable.
- A retention deadline that is extended until Tymra sends a verified-copy ACK.

## Tymra direct-HTTP sources

The following do not require Argus unless their delivery changes materially:

- ChristchurchNZ public event JSON.
- Eventfinda nationwide listing and detail HTML/JSON-LD.
- Ticketmaster city listing HTML/JSON-LD; only selectively required detail pages go to Argus.
- Eventbrite New Zealand listing JSON-LD.
- Humanitix New Zealand listing JSON-LD.
- Christchurch Airport arrivals/departures JSON.
- Christchurch Airport monthly passenger HTML table.
- Crusaders, Mainland Tactix and Canterbury Cricket official fixture pages.
- University of Canterbury key dates.
- Addington race dates and Riccarton Park Cup Week dates.
- ChristchurchNZ cruise dashboard discovery and its public Power BI report JSON.
- Te Pae Christchurch public event HTML.
- Venues Otautahi public page plus its browser-visible Storyblok JSON endpoint.
- Isaac Theatre Royal public event HTML.
- Christchurch City Council What's On paginated list HTML.
- Ara official academic calendar HTML.
- Canterbury A&P Show and Christchurch Marathon official event pages.
- Existing ordinary-HTTP government, weather, transport, university, venue, airport, port, and cruise adapters.

All schedule definitions remain disabled in development. Production schedules require a separate rights and operational review before they are enabled.
