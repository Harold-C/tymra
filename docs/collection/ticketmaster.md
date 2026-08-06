# Ticketmaster New Zealand collection

Last updated: 2026-08-03

**Development status:** Listing-first discovery, direct canonical persistence, a durable fallback
detail frontier and bounded hydration are implemented. Automated database acceptance covers both
the direct and fallback paths. The latest bounded real detail runs remained challenged after passive
waits and stopped safely, so reliable fallback-detail access is not currently verified.

## Decision

Ticketmaster New Zealand uses ordinary HTTP for city listings and durable Argus read-only Jobs only
for selectively required detail pages. Tymra has no local browser fallback. It does not use a Ticketmaster API key or
Discovery API. The current Worker collects public structured event data from five working New
Zealand city listing routes: Auckland, Wellington, Christchurch, Hamilton and Rotorua.

Event detail pages may initially present a Ticketmaster `One moment please...` interstitial containing
identity-verification markup. A two-stage read-only capture retains that initial state, polls its
semantic state once per second for up to 20 seconds without interaction and captures the final state.
Polling stops immediately when public content appears or a terminal block is visible. One verified page resolved to normal
public event content without a click, refresh, form input, login or challenge solution. A settled
page is extracted normally; a challenge that remains becomes `manual_required`, updates the target's
failure backoff and opens the source circuit.

The Worker-level `discovery`, `details` and `full` phases are implemented. The seeded daily discovery
and six-hour detail schedules remain disabled, and development hard-disables scheduler execution.

## Pipeline

1. Fetch up to five fixed city listing pages by ordinary read-only HTTP with a fixed Ticketmaster extractor.
2. Parse public `__NEXT_DATA__` and JSON-LD event IDs, titles, descriptions, dates, statuses, venues, addresses, coordinates, offers, performers and images.
3. Group listing records by canonical detail URL and date. When every record has a valid identity,
   category, date, explicit status, venue and city, persist all occurrences directly and mark the
   target `LISTING_COMPLETE` with `detailRequired=false` and `nextFetchAt=null`.
4. Queue only incomplete listing groups as `PENDING`. Select those detail targets by priority,
   enforce Argus and source/daily limits, and require detail JSON-LD to match the target URL
   exactly so recommended events cannot leak into persistence.
5. For a detail interstitial, retain initial HTML and `challenge-initial-screenshot.png`, poll at
   one-second intervals for at most 20 seconds without interaction, then retain the resolved,
   terminal-challenge or timed-out HTML and `challenge-screenshot.png`.
6. Persist direct listing HTML in `RawArtifact`. For Argus details, persist HTML/screenshot pointers; before ACK, copy and integrity-check those
   files into Tymra's evidence volume. Persist source facts in
   `SourceEvent` and `SourceEventOccurrence`, then exact-link them into `CanonicalEvent`,
   `EventOccurrence` and `CanonicalVenue`.
7. Refresh near-term fallback details more often. Consecutive unchanged detail hashes double the
   interval with a 24-hour cap within two days, 72-hour cap within 14 days, seven-day cap within 60
   days and 14-day cap beyond 60 days. A listing or hydrated detail marked cancelled is
   `CANCELLED`, `active=false` and `nextFetchAt=null`; ended targets are retired, failures back off
   exponentially, and a persistent challenge or rate limit opens the adaptive source circuit.
8. Keep impact status `PENDING_EVIDENCE` until capacity, attendance or corroborating demand evidence exists.

The local acceptance bound is one listing page, at most two fallback details and a 31-day effective
window. The normal collector uses one concurrent request, a 5-9 second inter-request delay, at most
five city pages, three fallback details per scheduled batch and a 20-request daily ceiling. A normal
complete snapshot now requests only the five listing pages; the previous 17-page/day ceiling remains
the worst case when incomplete targets require all four fallback batches. No automatic challenge
retry is performed. Both seeded schedules are disabled.

The retained five-city snapshot from 2026-07-20 contained 89 cards and 89 unique event URLs. All 89
had the fields required by the listing-complete rule, including three cancelled events. For that
snapshot the listing-first pipeline reduces initial pages from 94 (five listings plus 89
details) to five, while still persisting every accepted event occurrence.

On 2026-08-03, two real bounded listing acceptance passes each made one direct HTTP request,
discovered 20 events, persisted one complete listing occurrence, avoided all detail requests,
retained one HTML artifact, and created zero Argus executions. The second pass created zero new
source or canonical rows.

Repeated dates from one listing or detail group share one source event, canonical event and exact
venue during persistence. Each date remains a distinct occurrence. A later unchanged occurrence only
updates its run and last-seen fields instead of rebuilding the canonical graph.

## Access circuit

Argus owns browser identity, execution mode and challenge evidence. Tymra submits only versioned,
read-only connector jobs and never attempts to solve a challenge.

Persistent challenges or source rate limits advance the source circuit as follows:

| Consecutive challenge | Automatic cooldown | State after event |
|---|---:|---|
| 1 | 6 hours | `OPEN` |
| 2 | 24 hours | `OPEN` |
| 3 | 72 hours | `MANUAL_REQUIRED` |

After the first or second cooldown expires, the next collection is forced into `HALF_OPEN` mode:
exactly one Auckland listing page is requested, even when the caller requested `details` or `full`.
A normal listing closes and resets the circuit; another challenge advances it. `MANUAL_REQUIRED`
never auto-recovers merely because 72 hours elapsed and must be reviewed and reset by an operator.
No automatic challenge retry occurs inside a run.

## Verification

### ARGUS-TM-NAV-001 detail navigation

Ticketmaster listing discovery uses Tymra ordinary HTTP. A target with incomplete listing fields keeps
the allowlisted city listing URL in `metadata.discoveredFrom`. Detail execution sends that URL to
Argus as `entry_url`; Argus opens the city page and follows the exact event link in the same browser
context. Missing `discoveredFrom` is a hard parsing failure and never falls back to a cold direct
detail navigation. Each detail hydration therefore consumes two source requests in collection limits.
The 4 August 2026 bounded API acceptance completed Job
`job_6f1d1348fc107c6410c1f857adec40a4`, returned a complete Christchurch event detail without a
challenge, verified both evidence hashes and completed the result ACK.

### TYMRA-TM-HYBRID-ACCEPT-001

The 4 August 2026 non-dry-run acceptance exercised the complete deployed integration rather than an
Argus-only call:

1. Tymra Job `cmsdxli8x0000o877cmivo2ko` fetched the Auckland listing by ordinary HTTP, discovered
   19 events, selected two bounded records, persisted two complete listing events and created no
   Argus execution.
2. One selected target was temporarily marked as listing-incomplete to exercise the required-detail
   branch without changing its URL or `discoveredFrom`. After acceptance, this marker was removed and
   the original `listingComplete=true`, `detailRequired=false` metadata was restored.
3. Tymra Job `cmsdxoyir0000n3340g73654n` submitted Argus Job
   `job_6dc98647fb91cc048a69751b55ea4340`. Argus opened the Auckland entry page, followed event
   `240064D77F550D98` in the same Context and returned a successful detail.
4. CollectionRun `cmsdxoymz0001n30o5ozj4l00` completed with two source requests, one detail, one
   persisted event and two retained evidence artifacts. The copied HTML was 750,773 bytes and the
   screenshot 126,413 bytes; both local SHA-256 values matched Tymra `RawArtifact.contentHash`.
5. Tymra ACK completed and the Argus result endpoint returned HTTP 410 with the same result hash,
   proving that downstream persistence happened before Argus cleanup.

The first attempt exposed that the running worker still contained the pre-`entry_url` image. It made
no Argus execution and ended its CollectionRun as `PARTIAL`. Rebuilding the worker with the current
source removed that deployment drift; the successful acceptance above uses the rebuilt image.

- Extractor and normaliser tests cover Next-data parsing, source-host enforcement, missing identity, exact/missing end time and metadata preservation.
- Browser runtime tests distinguish a persistent challenge from a temporary interstitial, preserve
  both HTML and screenshot capture stages and extract the settled page only when challenge markers
  disappear. Normal scheduled pages still omit screenshots.
- Database integration performs discovery once and the same detail twice, proves an idempotent
  frontier, source/canonical events, venue and lineage, verifies 72/168-hour evidence classes, and
  confirms source configuration and both schedules do not change.
- Database integration also proves that a first challenge stores the six-hour `OPEN` state and an
  expired cooldown permits only one listing-only half-open probe before resetting to `CLOSED`.
- Real city checks succeeded for Auckland, Wellington, Christchurch, Hamilton and Rotorua. The latest bounded Auckland runs `cmrtfdhjc0001mq2ans0flgl0` and `cmrtfdst30001mq3thsa0v9ys` each made one request, discovered 18 events, persisted two records and retained three success artifacts with no failure.
- Pre-boundary real detail runs `cmrtepevg0001lb63reffd9ou` and
  `cmrtepodq0001lb7ax0kpbva1` each made one detail request, fetched zero details and ended `PARTIAL`
  with one failure. The corresponding frontier URLs were real Ticketmaster event URLs, not fixtures.
- Historical pre-Argus Browser Worker trace `ticketmaster-detail-diag-1784563586504` retained an 8,446-byte HTML
  response with SHA-256
  `821e8d11cb964ee940993bc0ad0e7d1eb9260a40ed63d00f849b9a689dba32c2`. Its page title is
  `Let's Get Your Identity Verified`; the HTML contains `Browsing Activity Has Been Paused`,
  reCAPTCHA, `action="identify"` and an `abuse-component`. The manifest records `readonlyOnly=true`,
  `externalSideEffectsPerformed=false` and `status=failed`. Sensitive request/IP identifiers are
  intentionally omitted here.
- That diagnostic predates the manifest's `requestedUrl` field, so the exact detail URL is recovered
  from the durable frontier rather than claimed from the manifest. It explains the earlier decision
  but no longer establishes a valid listing-only boundary.
- Follow-up full-evidence trace `ticketmaster-detail-live-1784583155045` captured the exact first
  frontier URL. Its original 1,280 x 900 PNG is retained at
  [`../evidence/ticketmaster-detail-live-1784583155045.png`](../evidence/ticketmaster-detail-live-1784583155045.png)
  with SHA-256 `8b43501b7f8551a36401313fc33642baede88284d82171f32bc518346d9e5bbf`.
  The screenshot shows Ticketmaster's `One moment please...` interstitial while its accompanying
  8,446-byte HTML contains the identity-verification and anti-bot markers above.
- Ideal two-stage trace `ticketmaster-detail-ideal-1784583809592` captured the same URL again. The
  initial 1,280 x 900 screenshot is
  [`../evidence/ticketmaster-detail-ideal-1784583809592-initial.png`](../evidence/ticketmaster-detail-ideal-1784583809592-initial.png).
  After the passive wait, the settled screenshot is
  [`../evidence/ticketmaster-detail-ideal-1784583809592-settled.png`](../evidence/ticketmaster-detail-ideal-1784583809592-settled.png)
  with SHA-256 `bebb72440d0c6cfee0dea529de16cadb77b8fcefc0fcfd12562b7386e0dc022e`.
  It shows the normal Amanda Nguyen event page and `EventCancelled` notice. Settled HTML grew from
  8,446 to 445,634 bytes and the existing extractor recovered event ID, title, status, time, venue,
  address, coordinates, offer status, performer and image.
- After detail implementation, bounded live runs `cmrtsi3ps0001qs41ob7ghc0z` and
  `cmrtsklsx0001pg2ae0i17xpf` waited ten seconds, while `cmrtsnv680001qn2ap5pdojwi` used the final
  20-second contract. The last two runs targeted the same Amanda Nguyen URL that had previously
  resolved. In the current external state all three runs retained a persistent challenge, fetched
  zero details and entered cooldown. Each completed capture retained initial HTML, settled challenge
  HTML, result and manifest; the initial 8,446-byte page grew to 188,100 bytes but retained
  `Browsing Activity Has Been Paused` and `abuse-component` markers. This is evidence of variable
  source behavior, not a parser or persistence success. These runs predate challenge-triggered
  scheduled screenshots. Future challenged captures retain the two HTML files, two PNG screenshots,
  result and manifest so operators can compare the visible states without another request.

## Remaining Production Gates

- Confirm source health and operational configuration in the target environment.
- Repeat one bounded live detail acceptance after the current cooldown; do not retry during cooldown
  or increase interaction to force access.
- Observe evidence expiry and several days of unattended discovery/detail runs in the target environment.
- Monitor city-route coverage and add a route only after a normal public route is verified; no speculative URL crawling is allowed.
- Measure exact cross-source matches with Eventfinda without silently fuzzy-merging events.

The implementation and automated database acceptance are complete; the remaining items are external,
production or operational gates. All schedules stay disabled in development.

On 2026-08-01 the current Ticketmaster unit tests, shared extractor tests, Worker typecheck and
Worker build passed. Live listing/detail capture and the database integration suite were not rerun;
the source-behaviour claims above remain tied to their recorded historical traces.

After source activation, production operators can use `schedule:ticketmaster:enable`; the command
refuses to enable the schedule unless the source is enabled and operationally healthy.
`schedule:ticketmaster:disable` disables it without changing source configuration.
