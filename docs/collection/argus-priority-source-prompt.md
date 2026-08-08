# Argus remaining New Zealand public-signal work

Use this handoff in the Argus project. Tymra already owns source configuration, disabled schedules,
durable submit/poll/resume, copy-before-ACK evidence retention, strict response validation,
normalisation, canonical-market routing, persistence and price-analysis lineage. Do not reproduce
those responsibilities in Argus.

## 1. DunedinNZ official events

- Connector/workflow: `dunedinnz-public / collect_events`.
- Result contract: `regional-events-public.collect_events@1.0.0`.
- Allowlist the official upcoming-events page and same-site event details.
- Return stable event IDs, title, canonical URL, explicit start/end, time precision, venue/address,
  city/region, category, description, status and field-level provenance.
- Respect the requested date window and record limit. Never infer missing dates, venues, attendance
  or accommodation impact.
- Current evidence: Argus health/readiness are green, but the running service rejects this connector
  as `INVALID_REQUEST`, so it is not registered yet.

## 2. Ticketek detail robustness

- Existing connectors: `ticketek-public / collect_listing` and `collect_detail`.
- Keep the fixed `ticketek-public.collect_listing@1.0.0` and
  `ticketek-public.collect_detail@1.0.0` contracts.
- Fix the intermittent legitimate detail-page shape retained by the 2026-08-06 Tymra acceptance,
  or classify the observed response with evidence. Do not return an unclassified
  `PARSING_ERROR` for a known page shape.
- Pass two consecutive real listing/detail runs with no second-pass row growth and verify cooldown,
  circuit-breaker and evidence ACK behaviour.

## 3. Auckland Airport monthly passengers

- Connector/workflow: `auckland-airport-monthly / collect_monthly_traffic`.
- Result contract: `auckland-airport-monthly.collect_monthly_traffic@1.0.0`.
- Entry point: the official Auckland Airport monthly traffic updates page and same-site reports.
- Return `sourceUrl`, `records`, `totalRecords`, `truncated`, `quality`, `warnings` and
  field-level provenance. Each record must contain:
  - `period` as `YYYY-MM`;
  - nullable non-negative `domesticPassengers` and `internationalPassengers`;
  - non-negative `totalPassengers`;
  - nullable `annualChangePercent`.
- Where both components are published, domestic plus international must equal total within rounding
  tolerance. Retain the page/report download and any challenge evidence.

## 4. Ministry of Transport airline performance

- Connector/workflow: `mot-airline-performance / collect_monthly_performance`.
- Result contract: `mot-airline-performance.collect_monthly_performance@1.0.0`.
- Entry point: the official airline on-time-performance page and its latest official workbook.
- Return `reportingBasis="VOLUNTARY_PARTICIPATING_AIRLINES"`, a non-empty `coverageCaveat`, source
  URL, records, totals, quality, warnings and field-level provenance. Each route/month record must
  contain:
  - `period`, three-letter origin/destination airport codes and nullable airport names;
  - nullable scheduled-flight count;
  - nullable arrival/departure on-time percentages in `0..100`;
  - nullable cancellation count and percentage in `0..100`.
- Preserve the voluntary/incomplete-coverage warning verbatim in structured data. Do not convert
  missing reporting into zero or infer whole-market performance.

## Shared operational requirements

- Read-only navigation and source-specific domain allowlists.
- Concurrency 1 initially, bounded pages/downloads/records and conservative retry.
- On challenge/block/unexpected page, retain screenshot, visible text or HTML, final URL, HTTP status,
  challenge classification, connector version and timestamp before cooldown/circuit breaking.
- Stable error categories with `retryable`, `cooldownUntil` and circuit state.
- Cancellation and restart recovery without duplicate completed executions.
- Keep evidence until Tymra copies and verifies it, and purge only after explicit ACK.
- Expose connector/workflow IDs and versions through an authenticated inventory endpoint.

## Acceptance

For each new connector, add normal, empty, partial and challenge fixtures; run one bounded real Job;
verify the exact v1 schema and retained evidence; then run the same Job twice through Tymra and prove
zero second-pass source, canonical or lineage growth. Production schedules remain disabled until
source activation and operational review remain separate.
