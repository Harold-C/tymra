# Tymra Release 1 And 1.5 Traceability

Last updated: 2026-08-05

Status is `verified` only after the named automated checks and relevant runtime evidence pass.
Release 1.5 uses `proposed`, `not_implemented`, `implemented_not_verified`, and `verified`. No
Release 1.5 row may inherit `verified` from Release 1 evidence.

The tables below contain both current status and explicitly dated historical evidence. A historical
`verified` result remains valid for that snapshot but does not mean the current revision was
rerun through the same gate. The current-worktree section is authoritative for fresh verification.

## Current Collection Status

Current status is maintained here; detailed historical run IDs and counts are preserved in the
[2026-07-30 full public-source acceptance](./evidence/public-source-acceptance-2026-07-30.md).

| Channel | Current local state | Remaining boundary |
| --- | --- | --- |
| Eventfinda | Bounded two-pass real collection, persistence and idempotency verified | Nationwide multi-day unattended stability requires a deployed long-running environment |
| Ticketmaster | Implementation and automated two-pass persistence verified; live detail attempts stop and cool down on challenge | Repeat live detail acceptance when the public page permits passive access |
| Configured non-OTA public channels | All 17 configured sources completed one unified bounded two-pass real local acceptance on 2026-07-30 | Fresh live rerun, production source review, activation and ongoing operations remain separate |
| Argus execution boundary | Async submit/poll/resume/ACK, restart recovery, cancellation and post-ACK purge have dated local evidence; current image/unit/build checks pass | Current-worktree database integration and production acceptance remain separate |
| School Sport NZ / Canterbury | Fresh two-pass cross-service collection through `api.argus.test`; 20/6 NZ raw/promoted and 13/0 Canterbury raw/promoted; local evidence retained before ACK | Production rights and schedule activation remain separate |
| Ticketek | Fresh two-pass listing collection retained 10 records and seven events per pass with zero second-pass growth | Detail `show.aspx` Akamai document is still misclassified by Argus as `PARSING_ERROR`; source remains disabled |
| Manual import | Parser and database regression verified | `not_verified`: genuine operator export and two-pass real-file evidence are missing |
| Booking/Airbnb/Expedia/Hotels/Agoda/Trip/Google Hotels | URL/canonical and deterministic research adapters only | Real collection implementation and production prerequisites are missing |

The reusable standard is [`collection/acceptance.md`](./collection/acceptance.md). Local acceptance
never requires or writes `approved-by` or `license-basis` and never changes source governance.

## Current Worktree Verification (2026-08-01)

The current revision contains the Argus orchestration, public-source acceptance, collection
efficiency, Compose and documentation changes described below. Git commit state is not used as
verification evidence.

| Gate | Fresh evidence from current worktree | Status |
| --- | --- | --- |
| Source/config assembly | Docker Node 24 base image built and Prisma Client generated from the current schema | verified |
| Web lint | `apps/web/scripts/lint.mjs` completed with zero errors or warnings | verified |
| TypeScript | Web, Worker, config, db, domain, providers and queue each passed `tsc --noEmit` | verified |
| Root unit/component suite | 14 files, 80 tests passed | verified |
| Worker unit suite | 7 files, 37 tests passed, including Argus client/orchestrator and failure classification | verified |
| Argus boundary suites | Async Job client, durable orchestration, schema validation, cancellation and evidence-before-ACK tests | verified by current Worker unit and database integration suites plus 2026-08-02 real bounded acceptance |
| Worker production build | `index`, `api`, `scheduler` and `cli` entrypoints built successfully | verified |
| Web production build | Next.js generated 64/64 static pages; only the known optional LinkeDOM `canvas` warning appeared | verified |
| Isolated Compose smoke | Fresh image, migration, seed, Web, Worker API, Worker, Redis, PostgreSQL and Mailpit passed on isolated ports/volumes; cleanup completed | verified |
| Database/API/Worker integration | Not rerun against the current worktree; the development database was inspected read-only | not_verified |
| Playwright/accessibility | Not rerun; no UI implementation file changed in the current diff | not_verified |
| Aggregate `pnpm verify` | The direct constituent checks above passed except integration; the aggregate command itself did not complete | not_verified |
| Current runtime image | Final Web/API/Worker container hashes match the current Argus client, Worker service and acceptance runner; Web, Worker and Argus HTTPS health checks return 200 | verified for runtime health; integration remains not_verified |

Read-only runtime inspection found the Argus orchestration migration applied, zero enabled schedules,
33 completed and one cancelled Argus execution, and no active Argus execution. Worker health/readiness
were healthy. During the final rebuild an existing RBNZ Job was correctly stopped by the source
governance guard with `RIGHTS_BLOCKED`, bringing the queue snapshot to 5 `FAILED` and 60
`DEAD_LETTER` Jobs. The remaining failures require classification before schedule activation and
are not treated as fresh quality-test failures without inspecting their origin.

The obsolete synchronous `argus-client 2.ts` and its duplicate test were removed before delivery;
the asynchronous Job client and its test are the only retained implementation.

## Product Requirements

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| PRD-PRODUCT, PRD-OVERVIEW, PRD-USERS | Public copy, locale messages, legal/methodology content | Public page and copy tests | verified |
| PRD-GOALS, PRD-PRINCIPLES, PRD-AUTOMATION | Domain decisions, worker pipeline, publication policy | Decision and worker integration tests | verified |
| PRD-SCOPE | Public routes, admin routes, API, worker and database | Route inventory and E2E suites | verified |
| PRD-DATA | Prisma models, append-only services, provider metadata | Database integration tests | verified |
| PRD-RESULT | Result versions, insights, secure links and feedback | Result API and E2E tests | verified |
| PRD-OPS | Exception Inbox and operational views | Admin API and Playwright tests | verified |
| PRD-MARKET | Market records, NZ eligibility and locale behaviour | Domain and bilingual flow tests | verified |
| PRD-COMMERCIAL, PRD-ROLES | Release 1 route guardrails and single admin | Route absence and auth tests | verified |
| PRD-METRICS | Event contracts and operational aggregates | Event payload and metrics tests | verified |
| PRD-NFR, PRD-COMPLIANCE | Config guards, audit, redaction, Docker and docs | Security, production-start and Compose checks | verified |
| PRD-AT-001..010 | End-to-end release acceptance | Release acceptance Playwright project | verified |
| PRD-CODEX | Workspace, commands, docs, CI and verification | `pnpm verify`, Compose and CI | verified |

Grouped identifiers retain the exact requirement-family names from the baseline documents. The
automated evidence below is supplemented by the final runtime evidence in `implementation-plan.md`.

## Business Rules

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| BR-GEN | Server-side domain policy and append-only persistence | Domain policy tests | verified |
| BR-OBJ | `packages/db/prisma/schema.prisma` and domain schemas | Schema/integration tests | verified |
| BR-MKT, BR-IN | Market eligibility, input and confirmation services | Domain/API tests | verified |
| BR-ST | Canonical `PriceCheckStatus` and transition validator | Exhaustive transition tests | verified |
| BR-SRC | Provider interface, collection runs and retry policy | Provider/worker tests | verified |
| BR-PRICE | Effective nightly total and availability normalization | Price normalization tests | verified |
| BR-COMP | Versioned competitor relationships and deduplication | Competitor tests | verified |
| BR-CONF, BR-RISK, BR-DEC | Confidence, risk and publication decisions | Decision table tests | verified |
| BR-EXC | Exception model, actions, priority and workspace | Admin API/E2E tests | verified |
| BR-DATA | Append-only records and identity merge history | Database integration tests | verified |
| BR-RES | Immutable results, links and notifications | Link/version/email tests | verified |
| BR-API | `/api/v1` response and error contracts | Public/admin API tests | verified |
| BR-FB | Feedback and learning boundaries | Feedback integration tests | verified |
| BR-LIMIT | Idempotency, free-check reuse and rate limits | Abuse/idempotency tests | verified |
| BR-PRIV, BR-SEC | Consent, retention, hashing, redaction and audit | Security tests | verified |
| BR-EVT | Shared analytics event names and safe payloads | Event contract tests | verified |
| BR-AT-001..010 | Seeded acceptance scenarios | Domain, integration and E2E suites | verified |
| BR-IMPL | Shared enums/config and production demo guard | Package boundary and startup tests | verified |

## Pages And Routes

| Requirement | Route/module | Automated evidence | Status |
| --- | --- | --- | --- |
| PG-IA, PG-ROUTES | Root redirect, `/en`, `/zh`, all listed public/admin routes | Route inventory test | verified |
| PG-LAYOUT, PG-HOME | Public shell and locale home | EN/ZH desktop/mobile E2E | verified |
| PG-CHECK | `/{locale}/check` | Validation and submission E2E | verified |
| PG-PROPERTY, PG-UNIT, PG-QUERY | Confirmation routes and APIs | Candidate/unit/query E2E | verified |
| PG-STATUS, PG-BIZSTATE | Persisted task status and terminal states | Status matrix tests | verified |
| PG-RESULT | Secure result route and feedback | Valid/expired/withdrawn E2E | verified |
| PG-PUBLIC | Methodology, FAQ, contact and legal routes | Public route/copy tests | verified |
| PG-ADMIN | Protected admin shell and sign-in | Auth and 403 tests | verified |
| PG-EXC, PG-EXC-DETAIL | Inbox and single-screen workspace | Admin E2E tests | verified |
| PG-OPS-CHECK | Price Check list/detail | Admin integration tests | verified |
| PG-MARKET | Properties, units, competitors, coverage, collections, sources, signals | Admin route/API tests | verified |
| PG-API, PG-SHARED | Uniform response and page state handling | HTTP error matrix tests | verified |
| PG-RESP, PG-SEO | Responsive layouts, metadata and noindex | Viewport and metadata tests | verified |
| PG-EVT | Safe analytics binding | Event tests | verified |
| PG-AT-001..008 | Complete page acceptance | Playwright release suite | verified |

## Visual And Interaction Requirements

| Requirement | Implementation | Automated evidence | Status |
| --- | --- | --- | --- |
| UI-GEN, UI-BRAND, UI-TOKEN, UI-TYPE | `apps/web/app/globals.css`, Web components and typography | Component tests plus post-move desktop/mobile browser QA | verified |
| UI-LAYOUT | Public, result and admin layout primitives | 390, 1440 and 1920 browser QA plus responsive Playwright | verified |
| UI-COMP, UI-IMPL | Shared buttons, fields, cards, states, tables and dialogs | Component interaction tests | verified |
| UI-HOME, UI-CHECK, UI-RESULT | Product-specific feature compositions | EN/ZH desktop/mobile Playwright and browser screenshots | verified |
| UI-STATE, UI-FORM | Canonical status mapping and async feedback | State matrix tests | verified |
| UI-OPS | Admin shell, inbox, workspace and operations | Admin visual/E2E tests | verified |
| UI-MOTION | Motion tokens and reduced-motion behaviour | Reduced-motion tests | verified |
| UI-A11Y | Semantic forms, keyboard, focus and non-colour cues | axe plus keyboard tests | verified |
| UI-I18N | `next-intl` messages and locale formatting | Translation parity tests | verified |
| UI-SEO | Metadata, hreflang, noindex and redaction | Metadata/security tests | verified |
| UI-QA, UI-AT-001..008 | Full visual acceptance matrix | Screenshot and accessibility projects | verified |

## Release 1.5 Customer Funnel Requirements

Authoritative source: [Release 1.5 customer funnel requirements](product/customer-funnel.md).

| Requirement | Planned implementation boundary | Required evidence | Status |
| --- | --- | --- | --- |
| R15-FLOW-001 | Anonymous supported-listing input, persisted `AnonymousCheck`, rough-result route and UI | EN/ZH desktop/mobile E2E obtains value without email | verified |
| R15-FLOW-002 | Rough-result presentation contract and limitation copy | Browser assertions distinguish rough/demo/formal evidence | verified |
| R15-INPUT-001 | Supported OTA URL allowlist, URL normalization, listing-ID resolution and invalid-input states | 7 resolver tests plus valid/invalid browser coverage | verified |
| R15-INPUT-002 | Automatic URL-context/default-context resolver with no anonymous date, guest or room controls | Resolver tests and control-absence E2E | verified |
| R15-INPUT-003 | Observed-context persistence/disclosure and `NO_DEFAULT_QUOTE` terminal handling | Persistence/browser disclosure plus no-default-quote integration regression | verified |
| R15-COST-001 | Rough analysis service and aggregate/cache provider boundary | Integration proves no `PriceCheck` before verification | verified |
| R15-ID-001 | Pending verification separate from active `CustomerUser` | Integration proves email request creates no customer | verified |
| R15-ID-002 | Idempotent magic-link consume transaction and `CustomerSession` | Concurrent consume produces exactly one success, customer session and formal job | verified |
| R15-ID-003 | Separate customer/Admin models, cookies and guards | Customer isolation and Admin authorization tests | verified |
| R15-SEC-001 | Hashed, single-use 15-minute magic link and clean redirect | Hash/clean-URL E2E plus replay, expiry and concurrent-consume integration tests | verified |
| R15-SEC-002 | Neutral verification response and invalid-link disclosure boundary | Eligible, idempotent and cooldown responses have the same neutral payload; timing-class acceptance remains | implemented_not_verified |
| R15-SEC-003 | Rotating, expiring and revocable customer session isolated from Admin | Rotation plus expired/revoked session 401 and Admin isolation tests | verified |
| R15-OWN-001 | `PriceCheck.customerUserId` plus report ownership guard | Owner 200, cross-account 404 and unauthenticated 401 integration tests | verified |
| R15-EMAIL-001 | `VERIFY_AND_SIGN_IN` plus conditional terminal notification policy | Mailpit E2E proves one happy-path email | verified |
| R15-EMAIL-002 | Authenticated in-page delivery acknowledgement and grace-period decision | E2E forces grace job and proves no second message | verified |
| R15-CONSENT-001 | Account disclosure plus separate default-off marketing consent | EN/ZH form plus service-consent requirement and default-off/explicit-opt-in persistence tests | verified |
| R15-ABUSE-001 | Idempotency across rough compute, link send, account activation and formal enqueue | Rough/send idempotency plus concurrent activation proving one formal enqueue | verified |
| R15-ABUSE-002 | Configurable risk service with allow/challenge/cooldown outcomes | Allow/cooldown verified; interactive challenge not implemented | implemented_not_verified |
| R15-QUOTA-001 | `UsageLedger` checked before formal enqueue | 1-per-24h boundary is enforced before enqueue in integration | verified |
| R15-MOTION-001 | Real-state progress components and reduced-motion path | Desktop/mobile reduced-motion E2E proves no active motion, static canvas and interactive FAQ | verified |
| R15-RET-001 | Scheduled cleanup expires unused links, keeps terminal token metadata for 30 days, removes expired anonymous records without formal ownership, removes expired/revoked sessions after 30 days, and removes rate-limit/abuse hashes after 90 days | Time-controlled Worker integration matrix | verified |
| R15-AN-001 | Daily aggregate counters with strict event/dimension allowlists; no row-level user/check/session identity or raw URL/query/report content | All 11 event names covered by contract/redaction tests; funnel integration verifies aggregate deltas and stored-value redaction | verified |
| R15-MIG-001 | Feature flag and bounded coexistence for legacy result links | Independent customer-funnel flag, migration/legacy-link tests and local rollback/restore exercise | verified |

## Release 1.5 Decision Trace

| Decision | Requirement coverage | Current evidence | Status |
| --- | --- | --- | --- |
| D-015 Two-stage customer funnel | R15-FLOW-001, R15-FLOW-002, R15-COST-001 | API, Mailpit and desktop/mobile E2E | verified |
| D-016 Customer/Admin separation | R15-ID-001, R15-ID-003, R15-SEC-003 | Separate models/cookies and authorization tests | verified |
| D-017 Verify before account activation | R15-ID-001, R15-ID-002, R15-SEC-001 | Pending state plus replay/expiry/concurrent activation integration and valid-link E2E | verified |
| D-018 Verify before provider cost | R15-COST-001, R15-QUOTA-001 | Zero pre-verification `PriceCheck` plus pre-enqueue quota boundary | verified |
| D-019 Authenticated formal reports | R15-OWN-001, R15-MIG-001 | Cross-account denial and legacy-link E2E | verified |
| D-020 Minimal conditional email | R15-EMAIL-001, R15-EMAIL-002, R15-CONSENT-001 | Single-message Mailpit and acknowledgement E2E | verified |
| D-021 Layered abuse and quota | R15-ABUSE-001, R15-ABUSE-002, R15-QUOTA-001 | Cache, email cooldown and device 429 tests; challenge pending | implemented_not_verified |
| D-022 No exclusive property claim | R15-OWN-001 | Independent anonymous records and customer ownership guard | verified |
| D-023 Retention defaults | R15-RET-001, R15-AN-001 | Recommended 7/30/90-day defaults implemented and tested; final production privacy approval remains external | implemented_not_verified |
| D-024 Real-state motion | R15-MOTION-001 | Server-backed stages plus desktop/mobile reduced-motion E2E | verified |
| D-025 Supported OTA link with automatic default context | R15-INPUT-001, R15-INPUT-002, R15-INPUT-003, R15-AN-001 | Resolver tests plus desktop/mobile browser evidence | verified |

## Required Commands

| Command | Intended coverage | Status |
| --- | --- | --- |
| `pnpm dev` | Next.js local development | current worktree image running and HTTPS route returns 200 |
| `pnpm worker` | Persistent Worker | current worktree image running; health/readiness return 200 |
| `pnpm db:generate` | Prisma client generation | current worktree verified on host and in Docker |
| `pnpm db:migrate` | Development migration | Release 1.5 retention/analytics and event-impact migrations applied in development |
| `pnpm db:seed` | Deterministic demo seed | historical verified; not rerun in this update |
| `pnpm lint` | Workspace lint | current worktree verified; no warnings or errors |
| `pnpm typecheck` | Workspace type checking | current worktree verified through aggregate command |
| `pnpm test` | Unit/domain and Worker suites | current worktree verified: 109 root tests (4 skipped fixtures) plus 55 Worker tests |
| `pnpm test:integration` | Database/API/Worker integration | current worktree verified: 63 tests |
| `pnpm test:e2e` | Playwright and accessibility | targeted reduced-motion desktop/mobile acceptance passed; full suite not rerun because UI implementation did not change |
| `pnpm build` | Production Web and Worker build | 64-page Web build and four Worker entrypoint builds verified; known optional LinkeDOM canvas warning only |
| `pnpm verify` | Lint, typecheck, unit, integration, build | current worktree verified on 2026-08-05 |

## Final Acceptance Evidence

| Gate | Evidence | Status |
| --- | --- | --- |
| Product baseline/control files | Five full Google Docs migrated to the canonical local `docs/product` directory with source IDs, timestamps, byte hashes and fresh-export content comparison | verified |
| Routes and bilingual UI | Next build inventory plus EN/ZH desktop/mobile Playwright | verified |
| Database and seed | Clean Compose volume migrated; seed repeated without duplicate growth | verified |
| Web, Worker and Admin | HTTP 200, running Worker, protected Admin sign-in and workspace E2E | verified |
| Providers and exceptions | Demo/Manual provider tests, real import preview/import, exception workspace E2E | verified |
| Secure links and email | Link integration/E2E, reissue API, real Mailpit SMTP delivery | verified |
| Quality commands | lint, typecheck, 26 unit, 24 integration, build and `pnpm verify` | verified |
| Browser QA | 16/16 Release 1 Playwright, axe, 390/1440/1920 viewport matrix | verified |
| Compose and README | Clean `up --build`, migration, repeat seed, endpoints and teardown exercised | verified |
| Persistent local URL | Web/Worker/health-check LaunchAgents restored; `tymra.test/en` HTTP 200 | verified |

## 2026-07-16 Homepage And Public Flow Refresh

| Gate | Current evidence | Status |
| --- | --- | --- |
| Release 1 homepage copy and navigation | EN/ZH desktop/mobile E2E; no Phase 0 preview or pilot-only homepage flow | verified |
| Homepage to rough-result handoff | Supported OTA URL creates a persisted `/{locale}/rough/{checkId}` result before email | verified |
| Locale continuity | Locale switch preserves check/result route and query parameters | verified |
| Mobile accessibility | Axe serious/critical violations: 0; horizontal insight region is keyboard focusable | verified |
| Responsive browser QA | Chrome at 390x844, 1440x900 and 1920x1080; no horizontal overflow | verified |
| Automated checks | `pnpm verify`: 26 unit and 24 integration tests; 16 desktop/mobile E2E; production build | verified |

## Release 1.5 Documentation Gate

| Gate | Required evidence | Status |
| --- | --- | --- |
| Product recommendation captured | Flow, rough/formal contract, identity, email, abuse, retention and migration documented | verified |
| Product approval | Explicit approval of the Release 1.5 baseline and D-025 defaults | verified |
| Implementation plan | Phases 1.5-0 through 1.5-8, dependencies, risks and gates recorded | verified |
| Implementation | Core funnel, cleanup, safe aggregate analytics, security/quota boundaries and rollback flag are implemented; interactive challenge provider remains external | implemented_not_verified |
| Automated acceptance | All locally implementable named matrices pass; neutral-response timing acceptance and external product/production gates remain | implemented_not_verified |
| Runtime acceptance | Chrome, Mailpit, migration, abuse cooldown and persistent-service evidence | verified |

## Worker Baseline v1 Evidence (2026-07-18)

| Gate | Evidence | Status |
| --- | --- | --- |
| Durable runtime | PostgreSQL jobs, Redis locks, API, Worker and Scheduler entrypoints | verified by isolated full Compose smoke |
| Domain persistence | Property, SellableUnit, Listing, SourceRegistry, QueryPlan/Profile, Observation, snapshots, analysis and result schema | verified by clean migration and seed |
| OTA research adapters | Seven shared contract adapters, deterministic record/replay, stable errors and rights metadata | verified |
| Public signal lineage | RawArtifact -> SourceMarketSignal -> MarketSignal -> MarketSignalSourceLink | locally verified across holidays, GeoNet, MBIE, Stats NZ, MetService, NZTA, RBNZ FX, airport and port/cruise adapters |
| Public source adapters | Every configured public source ID uses a concrete official/public transport or a required Argus read-only Job; Christchurch sports, UC and Lincoln dates, racing, cruise and airport monthly sources are registered separately | implementations, live-source probes and bounded two-pass local acceptance verified; Lincoln contract, local evidence copy, ACK purge and idempotency verified on 2026-08-04; schedules remain disabled |
| Canonical event persistence | Source-normalised series/occurrences, exact canonical matching, venue linkage, idempotent repeat writes and preserved source state | verified by Worker unit tests and local database integration regression |
| Event impact evidence v1 | Versioned evidence validation, provenance/time precision, trusted venue enrichment and conservative attendance-only promotion | unit/integration verified; Canterbury A&P Show two-pass real acceptance and 10-pass bounded soak passed; capacity-only Te Pae sample stays pending |
| Local source acceptance standard | Development-only guard, scheduler-off guard, bounded real collection, immutable run evidence, two-pass idempotency, retention, Redis lock, lease recovery, unchanged governance and full quality gate | verified and required for every implemented collection channel |
| Manual import local acceptance | Bounded operator-file parser, source/canonical accommodation persistence, immutable observation identity and evidence retention | implementation and fixture/database regression verified; genuine operator file and two-pass real-file evidence remain not_verified |
| Eventfinda browser collection | Nationwide discovery, detail frontier, persistence, retention and unattended stability | bounded acceptance and development-bootstrap implementation verified; nationwide run evidence is recorded in the source-specific document; unattended production evidence remains |
| Ticketmaster browser collection | Five-city discovery, durable detail frontier, bounded hydration, exact-target canonical persistence and cooldown | implementation and automated two-pass database acceptance verified; latest bounded live detail acceptance remained challenged and stopped without bypass |
| Source governance | Every public collection enforces enabled, internal approval, legal rights and operational health before network access | verified by Worker integration tests |
| Degraded source behavior | Approved calendar succeeds while Eventfinda rights failure is audited; valid formal result still completes | verified by Worker integration tests |
| Preview/formal pipeline | Two-date preview, 30-date formal result, multi-unit confirmation, cache reuse | verified by Worker integration tests |
| Email policy | Formal happy path creates and sends exactly one `RESULT_READY` delivery | verified by Worker integration and Mailpit smoke |
| Abuse controls | Idempotency, device/unit preview and formal email/unit limits recorded in usage/decision tables | verified |
| Retention | Redacted short-lived RawArtifact creation and expired payload deletion | verified |
| Failure controls | Redis lock contention/reacquisition, lease recovery only after expiry, retry schedule, dead-letter and blocking quality-gate tests | verified |
| Production fixture guard | Production config rejects both demo and fixture provider modes | verified |
| External live OTA collection | No approved API/browser source is configured; no fixture fallback is allowed | external prerequisite |
| Nationwide live panel | Schema, schedules and coverage operations exist; real 1,000-1,500 units require approved live catalog sources | external prerequisite |
| Quality baseline | Lint, workspace typecheck, 81 TypeScript unit/component tests, 34 browser runtime/extractor/Worker tests, 49 integration tests, 57-route Next.js production build and four Worker entrypoint builds pass; Next.js reports only LinkeDOM's unused optional-canvas warning | verified |
