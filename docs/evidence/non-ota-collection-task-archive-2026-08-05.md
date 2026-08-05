# Non-OTA collection task archive - 2026-08-05

## Purpose

This record closes the development task that established Tymra's non-OTA collection boundary,
expanded Christchurch demand coverage, moved all browser execution to Argus, and verified the first
School Sport and Ticketek connectors. It distinguishes implemented code, observed runtime evidence
and remaining work; it is not a claim that production schedules are enabled.

Product decisions from the same workstream remain authoritative in
[`decisions.md`](../decisions.md) and
[`customer-funnel.md`](../product/customer-funnel.md): the anonymous flow starts from a supported
OTA listing URL, uses the source's observed default context without asking for dates, guests or room
type, returns a useful rough result before email, and starts expensive formal collection only after
magic-link verification. The collection architecture below supports the formal analysis and market
evidence layers; it does not relax the OTA-input or abuse-control rules.

## Fixed architecture decisions

- PostgreSQL is authoritative for collection runs, raw artifacts, source records, canonical records,
  lineage and application-facing data. Redis coordinates locks and queues only.
- Source evidence enters a source-specific raw layer first. Tymra validates the source contract,
  normalises it into standard event series, occurrences or market signals, and preserves lineage
  from every promoted record back to its raw evidence.
- Complete listing/calendar data is consumed without opening one detail page per event. Detail
  requests are selective, deduplicated by canonical target and reserved for fields missing from the
  listing.
- Multiple dates for one event share one series/canonical identity and produce separate occurrences.
- Argus owns every source that requires JavaScript rendering, browser cookies, interactive
  navigation, challenge handling or screenshot evidence. Tymra has no Browser Worker or browser
  fallback.
- Tymra owns source governance, schedules, budgets, orchestration, evidence copy and hash
  verification, ACK, normalisation, deduplication, monitoring and Data Explorer presentation.
- Development schedules remain disabled. Production schedule enablement is a separate operational
  and rights decision.
- Event discovery does not by itself prove accommodation demand. Events without auditable capacity,
  attendance or corroborating-demand evidence remain `PENDING_EVIDENCE` under the
  [`event-impact-data-contract.md`](../collection/event-impact-data-contract.md).

## Local runtime and operations surface

- The semantic local origins mirror production boundaries: `tymra.test` is the customer/public
  application, `ops.tymra.test` is the protected Admin, `worker.tymra.test` is local-only health and
  readiness, and `mail.tymra.test` is local Mailpit. Browser execution is external at
  `api.argus.test`; Tymra no longer exposes a browser or noVNC service.
- Public, Admin and internal-service cookies and routes remain separated. PostgreSQL, Redis, Worker
  and Scheduler are internal Docker services and use project-qualified aliases.
- Compose restart policies and the local health-restoration mechanism keep the development stack
  available without a terminal-owned foreground process. The corresponding production origins use
  `.nz`; production DNS and deployment are not verified by this task.
- Obsolete Tymra Browser Worker containers, browser-only packages, dedicated networks and old
  browser volumes were removed after Argus became required. User-owned Argus profiles are outside
  Tymra's cleanup boundary.

The protected Admin is bilingual and now provides an operations-focused overview rather than a
collection of disconnected dashboards. Its non-OTA operating surfaces include:

- Data Explorer across raw evidence, parsed source records, canonical records, lineage and crawl
  frontiers;
- data-source controls and health, including enabled/paused state, rights and operational status,
  budgets, cooldown and latest success/failure information;
- collection run history and a run workspace with overview, evidence, output, configuration and
  audit views;
- collection incidents, parser/challenge evidence, retry actions and source health in one exception
  closure path;
- Argus health/readiness on the operations overview.

These surfaces show data already persisted by Tymra. They do not make an Argus Connector available
until its Tymra client contract, normaliser and source registry integration exist.

## Implemented and accepted Tymra sources

The direct-HTTP sources below have concrete adapters, source registry entries, disabled schedule
definitions, raw evidence and standard persistence paths:

- nationwide/public platforms: Eventfinda, Eventbrite and Humanitix;
- Christchurch public events and venues: ChristchurchNZ, Te Pae, Venues Otautahi, Isaac Theatre
  Royal and Christchurch City Council What's On;
- Christchurch demand context: Christchurch Airport live flights and monthly passengers, cruise
  calls, Crusaders, Mainland Tactix, Canterbury Cricket, University of Canterbury dates, Addington,
  Riccarton Cup Week and Ara academic dates;
- independent major annual events: Canterbury A&P Show and Christchurch Marathon, with promotion
  allowed only when current scale evidence is sufficient;
- Lincoln University annual key dates through Argus, already integrated into Tymra's
  `christchurch_university_dates` source with contract validation, local evidence copy, hash check,
  ACK and demand-relevant normalisation.

The direct Christchurch priority acceptance is recorded in
[`christchurch-priority-sources-acceptance-2026-08-04.md`](christchurch-priority-sources-acceptance-2026-08-04.md).
Its database second pass created no duplicate standard or lineage rows and all schedules remained
disabled.

## Argus connector status

Argus currently publishes these additional fixed contracts:

| Connector | Workflow | Data schema | Version | Argus state | Tymra state |
| --- | --- | --- | --- | --- | --- |
| `sporty-school-sport-public` | `collect_events` | `sporty-school-sport-public.collect_events` | `1.0.0` | implemented and bounded-live verified | not integrated |
| `ticketek-public` | `collect_listing` | `ticketek-public.collect_listing` | `1.0.0` | implemented and bounded-live verified | not integrated |
| `ticketek-public` | `collect_detail` | `ticketek-public.collect_detail` | `1.0.0` | parser fix verified; challenge gap remains | not integrated |

Bounded retained jobs verified School Sport NZ (`20/20` series/occurrences), School Sport
Canterbury (`20/20`) and Ticketek listing (`10/10`). Repeating each request with the same
idempotency key returned the same Job ID. HTML and screenshot sizes and SHA-256 values matched their
manifests.

School Sport Canterbury raw output includes administrative dates and entries-close rows, and most of
the sampled records did not contain a usable venue. Tymra must retain those raw rows but promote only
demand-relevant, geographically resolved occurrences. It must not infer a Canterbury location from
the source organisation alone.

## Ticketek detail regression

The original Ticketek detail extractor could return `success` with an unresolved occurrence while
the page's embedded `SOFTIX.GAData.Show` object contained usable performances. Argus fixed the parser
to prefer `Venues[].Performances[]`, emit one stable occurrence per Performance code, retain venue
and address, and reject a page whose occurrence time and location are all unresolved.

Retained real Job `job_561ed7d52dff1328700d5fa17a219ecd` verified the fix against
`NYTMERM26`:

- four stable performance occurrences;
- exact local start times, `Isaac Theatre Royal`, `Christchurch` and `Canterbury` on every row;
- public description and image;
- `quality: complete`, no missing fields and no challenge;
- HTML: 74,088 bytes, SHA-256
  `f9050b7e776e4e74d64902676b37eb6c090771efa85a3a25cc7788db5b4ff23d`;
- screenshot: 677,255 bytes, SHA-256
  `e5af51a73c5cf1eb7c32d90d8d53e1a15da6b34d71dce0ad1bf38c50eddccf62`.

The Argus container regression on 2026-08-04 ran 111 tests: 108 passed, none failed and three
independent PostgreSQL tests were skipped because `ARGUS_TEST_DATABASE_URL` was not configured.
The target Ticketek tests cover stable performance IDs, multiple dates, ticket states and rejection
of fully unresolved detail data.

## Open blocker: hidden Akamai challenge

A fresh independent capture after the parser fix did not return the event page:

- Job: `job_30688b81b6a9c8053e187c0033910e76`;
- trace: `tymra-verify-ticketek-fixed-1785819734554`;
- Argus result: `FAILED`, `PARSING_ERROR`, `retryable: false`, `challenge: null`;
- retained HTML: 2,377 bytes, SHA-256
  `0e108a1bb53b2ed18ab31af284377a611825180c127a623cf876d77ea1c90874`;
- retained screenshot: 7,392 bytes, SHA-256
  `56210f59b42320c8daba141f6a4984da19c51a4c04f4d3d8f7071cadee29b627`.

The HTML is an Akamai behavioural challenge and contains `sec-if-cpt-container`,
`behavioral-content`, `scf-akamai-protected-by` and `Powered and protected by Akamai`; its challenge
container is initially hidden and the screenshot is blank. Argus therefore misclassified a source
challenge as a non-retryable parser failure. Until Argus detects this shape as `ACCESS_CHALLENGE`,
Ticketek cannot be considered ready for unattended full collection because cooldown, consecutive
block accounting and the circuit breaker are bypassed.

The failed Job remains unacknowledged so Argus can use the exact retained evidence for regression.
The required Argus fix is to classify the above DOM/script signals before extraction, retain the
evidence, stop interaction, apply the Ticketek source policy and add the real shape as a fixture.

## Remaining Tymra work

Tymra's current `ArgusConnectorId`, workflow union and contract map do not include
`sporty-school-sport-public`, `ticketek-public` or `collect_events`. Consequently Tymra cannot yet
schedule these connectors, validate their results, copy and ACK their evidence, normalise their raw
records, expose them in collection control/Data Explorer, or run database idempotency acceptance.

Resume in this order:

1. In Argus, fix and regress the hidden Akamai challenge classification. Do not implement that
   browser change in Tymra.
2. In Tymra, add the three fixed connector/workflow contracts and strict source-specific schemas.
3. Add source registry/control entries and asynchronous Argus submission without enabling schedules.
4. Copy and hash-verify every retained evidence object before ACK; prove post-ACK `410` cleanup.
5. Normalise Sporty and Ticketek series/occurrences, filtering administrative School Sport rows and
   preserving missing location instead of guessing it.
6. Run two bounded database passes for School Sport NZ, School Sport Canterbury, Ticketek listing
   and one selected detail. The second pass must add zero source, canonical or lineage rows.
7. Re-run cancellation, restart recovery and ACK failure-path acceptance, then update Data Explorer
   and collection monitoring evidence.

## Coverage conclusion

Christchurch now has broad direct coverage across council events, major venues, public event
platforms, sports, university and Ara dates, racing, cruise, airport demand and selected independent
annual events. Lincoln is integrated through Argus. The remaining material event-discovery gap in
this task is not another direct Christchurch adapter: it is completing Tymra integration and
operational acceptance for School Sport and Ticketek, plus correcting Ticketek's hidden Akamai
challenge classification. Coverage should be described as broad but not complete until those items
pass end-to-end database acceptance.

## Archive boundary

This archive records the verified state observed through 2026-08-05. The Tymra worktree contains a
large set of uncommitted changes from this workstream, including the Argus-only cutover, Admin
operations UI, direct Christchurch adapters and Lincoln integration. No commit, push, production
deployment, production database migration or production schedule activation was performed as part
of this archive step. Before release, review the complete diff and run the repository's full quality
gate from the intended release commit.
