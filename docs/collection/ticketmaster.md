# Ticketmaster New Zealand collection

Last reviewed: 2026-10-06.

The bounded `progress-ticketmaster-daily` plan uses Argus's headed browser and persistent
public Profile: at most three listing pages, two necessary details and 100 results, within
the source's 20-request daily budget. The superseded weekly pilot was deleted on 2026-10-06.
Current activation and recovery evidence belong in [traceability](../traceability.md);
successful listing-only trials do not verify challenged detail access.

## Decision

Ticketmaster New Zealand uses Argus read-only Jobs for city listings and selectively required
detail pages. Tymra owns the frontier and business persistence. It does not use a Ticketmaster
API key or Discovery API. The current Worker collects public structured event data from five working
New Zealand city listing routes: Auckland, Wellington, Christchurch, Hamilton and Rotorua.

Event detail pages may initially present a Ticketmaster `One moment please...` interstitial containing
identity-verification markup. A two-stage read-only capture retains that initial state, polls its
semantic state once per second for up to 20 seconds without interaction and captures the final state.
Polling stops immediately when public content appears or a terminal unresolved state is visible. One
verified page resolved to normal public event content without interaction. A settled page is
extracted normally; an unresolved state remains `manual_required`, updates the target's failure
backoff and opens the source circuit.

The Worker-level `discovery`, `details` and `full` phases are implemented. The old seeded daily
discovery and six-hour detail definitions remain disabled. The separate bounded daily progress plan
is the current production schedule; development hard-disables scheduler execution.

## Pipeline

1. Capture up to five fixed city listing pages through the Argus headed browser connector and its persistent public profile.
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
6. Persist Argus HTML/screenshot pointers for listings and details in `RawArtifact`; before ACK, copy and integrity-check those
   files into Tymra's evidence volume. Persist source facts in
   `SourceEvent` and `SourceEventOccurrence`, then exact-link them into `CanonicalEvent`,
   `EventOccurrence` and `CanonicalVenue`.
7. Refresh near-term fallback details more often. Consecutive unchanged detail hashes double the
   interval with a 24-hour cap within two days, 72-hour cap within 14 days, seven-day cap within 60
   days and 14-day cap beyond 60 days. A listing or hydrated detail marked cancelled is
   `CANCELLED`, `active=false` and `nextFetchAt=null`; ended targets are retired, failures back off
   exponentially, and a persistent challenge or rate limit opens the adaptive source circuit.
8. Keep impact status `PENDING_EVIDENCE` until the [impact policy](event-impact-data-contract.md) qualifies the evidence; capacity alone is insufficient.

The local acceptance bound is one listing page, at most two fallback details and a 31-day effective
window. The normal collector uses one concurrent request, a 5-9 second inter-request delay, at most
five city pages and three fallback details under the collector defaults. The active production
schedule narrows each run to three listings and two necessary details. Production retains a
20-request daily ceiling; development has no cumulative daily ceiling. A complete five-city
snapshot using the collector defaults requests five listing pages; the current daily plan covers
at most three. No automatic challenge retry is performed. Development seed definitions are not the active
production plan.

Repeated dates from one listing or detail group share one source event, canonical event and exact
venue during persistence. Each date remains a distinct occurrence. A later unchanged occurrence only
updates its run and last-seen fields instead of rebuilding the canonical graph.

## Access circuit

Argus owns browser identity, execution mode and evidence capture. Tymra submits only versioned,
read-only connector jobs and never attempts to solve an unresolved state.

Persistent unresolved states or source rate limits advance the source circuit as follows:

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

Ticketmaster listing discovery uses Argus. A target with incomplete listing fields keeps
the allowlisted city listing URL in `metadata.discoveredFrom`. Detail execution sends that URL to
Argus as `entry_url`; Argus opens the city page and follows the exact event link in the same browser
context. Missing `discoveredFrom` is a hard parsing failure and never falls back to a cold direct
detail navigation. Each detail hydration therefore consumes two source requests in collection limits.
The navigation and contract behavior must be verified against the current Argus candidate;
older direct-HTTP/hybrid runs are not acceptance of the present transport.

Required regression covers listing-complete avoidance, exact detail identity, missing fields,
idempotent series/occurrence/lineage writes, two-stage challenge evidence, 72/168-hour TTL
selection, source configuration preservation and the single-page half-open circuit.
Database TTL handling does not prove local evidence-file physical deletion.

The historical [initial capture](../evidence/ticketmaster-detail-live-1784583155045.png),
[two-stage initial image](../evidence/ticketmaster-detail-ideal-1784583809592-initial.png) and
[settled image](../evidence/ticketmaster-detail-ideal-1784583809592-settled.png) document variable
public challenge behavior in July 2026. They do not establish current source availability.

## Remaining Production Gates

- Keep monitoring source health and operational configuration in the target environment.
- Complete one bounded live detail acceptance when a legitimate incomplete listing is due; do not retry during cooldown
  or increase interaction to force access.
- Observe evidence expiry and several days of unattended discovery/detail runs in the target environment.
- Monitor city-route coverage and add a route only after a normal public route is verified; no speculative URL crawling is allowed.
- Measure exact cross-source matches with Eventfinda without silently fuzzy-merging events.

The implementation and automated database acceptance are complete; the remaining items are external,
production or operational gates. All schedules stay disabled in development.

Recovery of an existing paused daily plan uses the guarded
`schedule:public:recovery-prepare`, `schedule:public:recovery-trial` and
`schedule:public:recovery-enable` flow with the source, deployed 40-character revision and
`--confirm RESTORE_PUBLIC_SCHEDULE`. It requires the latest two complete exact-plan,
one-attempt trials, retained evidence and verified delivery. Preserve failures and the frozen
checkpoint; inspect actual runtime state and authorization before these mutations.

Do not use `schedule:ticketmaster:enable` to resume the daily plan: it enables all source-bound
definitions. `schedule:progress:enable` creates a new plan rather than recovering an existing one.
Pause the affected plan through audited control and retain its registry, frontier, runs and evidence.
