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
| `sporty-school-sport-public` | `collect_events` | `sporty-school-sport-public.collect_events` | `1.0.0` | implemented and bounded-live verified | integrated; schedules disabled |
| `ticketek-public` | `collect_listing` | `ticketek-public.collect_listing` | `1.0.0` | implemented and bounded-live verified | integrated; schedules disabled |
| `ticketek-public` | `collect_detail` | `ticketek-public.collect_detail` | `1.0.0` | embedded-performance and umbrella-show parsers bounded-live verified | integrated and two-pass verified; schedules disabled |

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

## Historical hidden Akamai challenge

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
container is initially hidden and the screenshot is blank. At that historical checkpoint, the Argus
fix keyed this shape to a final `/detection.aspx` path. Those detail Jobs retained `show.aspx`, so the
then-current runtime returned `PARSING_ERROR`, `retryable: false`, `challenge: null`. Tymra did not
attempt to bypass it; the later normal umbrella-page resolution is recorded below.

Fresh two-pass Tymra Jobs `cmsfstri00000p52a7rnyuf8k` and `cmsfsuicw0001p52arnlaeyzf` verified the
safe partial boundary. Each pass completed its Ticketek listing execution, retained ten listing
records and seven canonical events, attempted one selected detail, and finished `PARTIAL /
PARTIAL_FAILURE`. The detail executions `job_2a2c0ef4296f8d5ffa89beab8c15fb35` and
`job_422830894dcf5516dc4ad90ebe6eb33d` retained the challenged HTML and blank screenshot locally.
The second pass created no new source, canonical or lineage rows. All four execution evidence pairs
were copied before any result ACK; zero `argus-evidence:` references remained.

## Umbrella-detail resolution and fresh acceptance

The retained `LEGOSWE27` page was a normal HTTP 200 `UmbrellaShow`, not a
challenge. Its `SOFTIX.GAData.Show.Venues` value was null while five public
child cards carried the child show codes, date ranges and venue text. Argus now
uses those cards only after embedded performances produce no occurrences. It
keeps the parent series, produces stable child occurrence IDs, retains four
explicit ranges and leaves the anytime start null with `quality: partial`.

Acceptance `public-sources-2026-08-05T09:23:46.485Z-0f8aebe9` reran only
`ticketek_events` twice through the rebuilt local Argus service:

- Tymra Jobs `cmsfvqspt0000ru84dm7cq2jt` and `cmsfvrisb0001ru84dz9u0ql3`
  and both CollectionRuns finished `SUCCEEDED` with no failures;
- each pass made two Argus executions, retained four evidence objects locally
  before ACK and left zero remote evidence references;
- each pass normalised 15 records into 11 events; pass one added one source
  event and four occurrences beyond the earlier listing-only baseline;
- pass two added zero source, canonical or lineage rows and reported
  `unchangedSkipped: 11`;
- governance snapshots were unchanged and enabled schedules stayed at zero.

## Completed Tymra work

Tymra now includes the three connector/workflow contracts, strict cross-record validation, source
registry and collection-control entries, durable Argus submission and disabled schedule definitions.
It stores the full source connector payload as raw JSON, retains HTML/screenshots, and reuses the
existing copy/size/hash/database-reference gate before sending the exact result hash ACK. Automated
acceptance proves that a post-ACK result read returns `410`, and that missing evidence prevents ACK.

Sporty and Ticketek series and occurrences now use the canonical event pipeline. School Sport
administrative rows, unresolved locations and rows not explicitly marked Canterbury-hosted remain
raw. Ticketek missing city/region remains missing. Every promoted event stays `PENDING_EVIDENCE`
until separate scale and accommodation-demand evidence exists.

The fresh cross-service acceptance reached Argus through `https://api.argus.test`. School Sport NZ
completed two passes with 20 raw records and six promoted events; School Sport Canterbury completed
two passes with 13 raw records and correctly promoted zero unresolved/administrative rows. Each
School Sport pass used one Argus execution, retained HTML/screenshot evidence locally, left zero
remote evidence references and added no rows on the second pass. Ticketek listing/detail also
preserved second-pass idempotency after the umbrella parser fix. Governance snapshots were
unchanged and all related schedules remained disabled.

After the multi-execution evidence fix, 102 root tests (four live probes skipped), 53 Worker unit
tests and 55 database/API/Worker integration tests passed. Cancellation, restart recovery,
per-execution evidence scoping, all-copy-before-any-ACK and ACK failure paths remain covered by the
durable Argus orchestration suite.

## Coverage conclusion

Christchurch now has broad coverage across council events, major venues, public event platforms,
sports, university and Ara dates, racing, cruise, airport demand and selected independent annual
events. Lincoln, School Sport and Ticketek listing/detail are integrated through Argus. Production
rights approval and schedule enablement remain separate gates;
they are not implied by the completed development and database acceptance.

## Archive boundary

This archive records the verified state observed through 2026-08-05. No production deployment,
production database migration or production schedule activation was performed as part of this work.
Before release, review the complete diff and run the repository's full quality gate from the intended
release commit and target environment.
