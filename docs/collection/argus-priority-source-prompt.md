# Argus priority source implementation prompt

Use this prompt in the Argus project. Do not implement browser execution in Tymra.

## Task

Implement production-shaped browser collection for three New Zealand event channels, following the
existing Argus connector/workflow, evidence, challenge, cooldown, circuit-breaker, cancellation,
restart-recovery and copy-before-ACK conventions.

### 1. School Sport NZ and School Sport Canterbury

Entry points:

- `https://www.sporty.co.nz/SSNZ/Sport-1/Events`
- `https://www.sporty.co.nz/sscanterbury`

Both return Cloudflare `403` challenge pages to ordinary HTTP requests. Build a Sporty browser
connector that keeps `School Sport NZ` and `School Sport Canterbury` as distinct source
organisations. Prefer listing/calendar extraction and open detail pages only when required fields
are absent. Deduplicate detail URLs before navigation.

Return stable series and occurrence IDs plus: title, sport, gender/grade, venue, address/locality,
region, start/end date and time, status, canonical URL, source organisation, source-updated value,
image/description when present, and field-level provenance. Explicitly classify Canterbury-hosted
records. Do not infer missing dates, venues, attendance or accommodation impact.

### 2. Ticketek New Zealand

Entry points:

- `https://www.ticketek.co.nz/`
- `https://premier.ticketek.co.nz/shows/whatson.aspx`

Ordinary HTTP currently returns Akamai `403 Access Denied` or no response. Implement browser-based
listing discovery followed by selective detail enrichment. Return stable event series and explicit
occurrences with title, date/time, venue, city/region, status including cancelled/postponed,
ticket state, category, image, canonical URL and field-level provenance. Stop enrichment for a
cancelled occurrence. Deduplicate shared detail URLs and do not revisit complete unchanged records.

### Operational requirements

- Use an allowlist limited to the declared source domains and read-only navigation.
- Default to the existing Argus production browser mode and persisted session/profile policy.
- Keep concurrency at 1 per source initially, with human-scale jitter, bounded pages/details and a
  source-specific daily budget.
- On every challenge/block/unexpected page, save full-page screenshot, visible text or HTML, final
  URL, response status, challenge classification, timestamp, browser mode and connector version
  before applying cooldown or opening the circuit breaker.
- Return stable error categories and `retryable`, `cooldownUntil` and circuit-breaker state.
- Support cancellation and restart recovery without duplicate completed executions.
- Keep evidence until Tymra has copied and hash-verified it; delete/expire only after explicit ACK.
- Expose connector/workflow IDs, versions and readiness in Argus inventory/health output.

### Acceptance

- Add parser/contract fixtures for normal, empty, cancelled/postponed and challenge pages.
- Run one bounded real collection per source and retain evidence.
- Run two identical database/execution passes; the second pass must create no duplicate source,
  series or occurrence records.
- Verify challenge evidence, cancellation, restart recovery and ACK cleanup.
- Report final connector/workflow IDs, exact result schemas and version numbers to the Tymra task;
  Tymra integration must not begin until those contracts are fixed.
