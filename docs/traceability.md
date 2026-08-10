# Tymra Release 1 And 1.5 Traceability

Last updated: 2026-08-10

Status is `verified` only after the named automated checks and relevant runtime evidence pass.
Release 1.5 uses `proposed`, `not_implemented`, `implemented_not_verified`, `verified_gated_off`, and `verified`. No
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
| Configured non-OTA public channels | All 17 configured sources completed one unified bounded two-pass real local acceptance on 2026-07-30 | Fresh live rerun, production activation and ongoing operations remain separate |
| Major-market event/public signals | 14 markets have a direct official calendar and Dunedin has a verified Argus calendar path; DOC alerts and TVF/MRTE cover all 15, IVS provides rolling context, and MoT plus Auckland Airport monthly passengers passed two persistence runs | Multi-day stability and schedule activation remain separate; Auckland's malformed final source month is excluded |
| Argus execution boundary | Async submit/poll/resume/ACK, restart recovery, cancellation and post-ACK purge have dated local evidence; current image/unit/build checks pass | Current-worktree database integration and production acceptance remain separate |
| School Sport NZ / Canterbury | Fresh two-pass cross-service collection through `api.argus.test`; 20/6 NZ raw/promoted and 13/0 Canterbury raw/promoted; local evidence retained before ACK | Production activation and schedule activation remain separate |
| Ticketek | Fresh two-pass listing/detail collection succeeded through `api.argus.test`; 15 raw records and 11 events per pass, with zero second-pass growth | Production activation remains separate; source remains disabled |
| Manual import | Parser and database regression verified | `not_verified`: genuine operator export and two-pass real-file evidence are missing |
| Nine public OTA brands | Tymra URL/canonical parsing, strict public Argus contracts, provider-family persistence, bounded comparable discovery/rate workflow and cross-brand deduplication are implemented; dormant Booking Demand and Expedia Rapid modules were removed | Partner APIs are deferred until credentials exist and must return as a new reviewed implementation; Google Hotels is intentionally excluded from OTA execution |

The reusable standard is [`collection/acceptance.md`](./collection/acceptance.md). Local acceptance
never changes source configuration and cannot enable schedules.

## Current Worktree Verification (2026-08-06)

The current revision contains the Argus orchestration, public-source acceptance, collection
efficiency, Compose and documentation changes described below. Git commit state is not used as
verification evidence.

| Gate | Fresh evidence from current worktree | Status |
| --- | --- | --- |
| Source/config assembly | Docker Node 24 base image built and Prisma Client generated from the current schema | verified |
| Web lint | `apps/web/scripts/lint.mjs` completed with zero errors or warnings | verified |
| TypeScript | Web, Worker, config, db, domain, providers and queue each passed `tsc --noEmit` | verified |
| Root unit/component suite | 19 files, 146 tests passed and 5 external provider fixtures intentionally skipped | verified |
| Worker unit suite | 17 files, 86 tests passed, including named Argus downloads, retry-safe evidence retention, strict aviation contracts, nationwide signal routing, source/schedule gating and failure classification | verified |
| Argus boundary suites | Async Job client, durable orchestration, schema validation, cancellation and evidence-before-ACK tests | verified by current Worker unit and database integration suites plus 2026-08-02 real bounded acceptance |
| Worker production build | `index`, `api`, `scheduler` and `cli` entrypoints built successfully | verified |
| Web production build | Next.js generated 65/65 static pages; only the known optional LinkeDOM `canvas` warning appeared | verified |
| Isolated Compose smoke | Fresh image, migration, seed, Web, Worker API, Worker, Redis, PostgreSQL and Mailpit passed on isolated ports/volumes; cleanup completed | verified |
| Database/API/Worker integration | 16 files and 74 tests passed against a migrated and seeded isolated PostgreSQL database; nationwide address API/Worker identity, persistent cache, confirmation-only Property promotion, idempotency and cross-region isolation are included, and the database was removed afterwards | verified |
| Playwright/accessibility | Not rerun after the source-control UI simplification | not_verified |
| Aggregate `pnpm verify` | All constituent gates—lint, typecheck, unit, integration and build—passed; they were invoked separately in this update | verified by constituents |
| Current runtime image | Web, Worker and Worker API were rebuilt/recreated from the current worktree; database, Redis and Argus health are green | verified; Worker health returned HTTP 200 and Web returned HTTP 200 |

Runtime inspection found the source-control removal migration applied, zero enabled schedules and
no Scheduler container in development. Worker health returned database, Redis and Argus healthy;
Web and Worker health both returned HTTP 200. Historical failed/dead-letter jobs remain available
for operational review and were not replayed by this change.

The nationwide source-schedule plan resolves all 50 direct sources to 52 schedules without a missing
mapping. Source scheduling now checks only enablement, registered adapters and operational health;
development hard-disables scheduler execution. The plan is read-only and left all schedules disabled.

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
| R15-SEC-002 | Neutral verification response and invalid-link disclosure boundary | Eligible, idempotent and cooldown responses share one payload; integration verifies the idempotent and cooldown timing floor | verified |
| R15-SEC-003 | Rotating, expiring and revocable customer session isolated from Admin | Rotation plus expired/revoked session 401 and Admin isolation tests | verified |
| R15-OWN-001 | `PriceCheck.customerUserId` plus report ownership guard | Owner 200, cross-account 404 and unauthenticated 401 integration tests | verified |
| R15-EMAIL-001 | `VERIFY_AND_SIGN_IN` plus conditional terminal notification policy | Mailpit E2E proves one happy-path email | verified |
| R15-EMAIL-002 | Authenticated in-page delivery acknowledgement and grace-period decision | E2E forces grace job and proves no second message | verified |
| R15-CONSENT-001 | Account disclosure plus separate default-off marketing consent | EN/ZH form plus service-consent requirement and default-off/explicit-opt-in persistence tests | verified |
| R15-ABUSE-001 | Idempotency across rough compute, link send, account activation and formal enqueue | Rough/send idempotency plus concurrent activation proving one formal enqueue | verified |
| R15-ABUSE-002 | Configurable risk service with allow/challenge/cooldown outcomes | Decision matrix plus signed, expiring development challenge handshake; deterministic mode is forbidden in production | verified |
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
| D-021 Layered abuse and quota | R15-ABUSE-001, R15-ABUSE-002, R15-QUOTA-001 | Cache, challenge handshake, email cooldown, device 429 and formal quota tests | verified |
| D-022 No exclusive property claim | R15-OWN-001 | Independent anonymous records and customer ownership guard | verified |
| D-023 Retention defaults | R15-RET-001, R15-AN-001 | Recommended 7/30/90-day defaults implemented and tested; final production privacy approval remains external | implemented_not_verified |
| D-024 Real-state motion | R15-MOTION-001 | Server-backed stages plus desktop/mobile reduced-motion E2E | verified |
| D-025 Supported OTA link with automatic default context | R15-INPUT-001, R15-INPUT-002, R15-INPUT-003, R15-AN-001 | Resolver tests plus desktop/mobile browser evidence | verified |

## Post-Release Membership System

Authoritative commercial and functional contract: [Membership plans](product/membership-plans.md). Authentication requirements remain in [Release 1.5 customer funnel requirements](product/customer-funnel.md); customer routes and page composition remain in [page structure](product/page-structure.md); responsive, state and visual acceptance remain in [visual interaction](product/visual-interaction.md).

The statuses below describe the current implementation, not the target specification. Price Check unlock Magic Links are separate from the member email/password login and do not verify membership authentication. A membership backend, plan card or authenticated check page does not by itself verify the complete customer membership module.

| Requirement | Planned implementation boundary | Required evidence | Current status |
| --- | --- | --- | --- |
| `MEM-AUTH-001`, `R15-AUTH-001` | Independent registration and email/password sign-in with zero pricing side effects | Real browser registration/login plus isolated PostgreSQL proof of Free membership creation with zero `AnonymousCheck`, `PriceCheck`, Job, unit and usage creation | `verified` |
| `MEM-AUTH-002`, `R15-AUTH-002` | Bcrypt password storage, neutral invalid credentials, throttling, duplicate protection and return-target validation | Credential/API integration, password-hash inspection, middleware return-target tests, old-password rejection and real password-change browser acceptance | `verified` |
| `MEM-AUTH-003`, `R15-AUTH-003` | Customer current-session and all-session sign-out, isolated from membership and Admin | Session API integration plus real browser current-session and settings all-session paths | `verified` |
| `MEM-AUTH-004`, `R15-AUTH-004` | Protected-route redirect through password sign-in with allowlisted same-origin `returnTo` | Middleware exact-route/query, open-redirect and EN/ZH locale-continuity tests/browser evidence | `verified` |
| `MEM-RISK-001` | Email verification before collection plus Benefit Group identity across account/device/property/payment subjects | Isolated PostgreSQL verifies unverified denial, same-device/same-Property shared Free usage, and shared-IP/different-device separation | `verified` |
| `MEM-RISK-002` | Unique Free/promotion claims, serializable retries, concurrent collection/noVNC limits and independent export/API quotas | Three-way concurrent Free claim, idempotent NZ-month export and payment-promotion uniqueness integration | `verified` |
| `MEM-RISK-003` | HMAC-only Stripe fingerprint, refund/dispute/Radar cases and member appeal | Synthetic signed-event persistence test plus customer risk API and Admin review boundary | `implemented_not_verified` |
| `MEM-RISK-004` | Reason-code dashboard, audited allow/deny/release and independent risk retention | Admin API/retention lifecycle tests and browser operations acceptance | `implemented_not_verified` |
| `MEM-NAV-001` | Session-aware public/customer navigation with Sign in, Account and Sign out | Real EN/ZH authenticated/anonymous browser QA at desktop, 390px and 320px | `verified` |
| `MEM-ACC-001` | Operational account overview with plan, lifecycle, usage, units, horizons, cadence and next action | State matrix for Free/Host/Pro/Portfolio and all subscription lifecycle states | `implemented_not_verified` |
| `MEM-UNIT-001` | Pricing-unit list/detail, add/confirm, activation, deactivation, reactivation and downgrade selection | Ownership, stable-identity, unit-limit and transactional job-cancellation tests plus browser flows | `implemented_not_verified` |
| `MEM-CHECK-001` | Owner-only filterable history and result detail with observed-price/recommendation separation | Cross-account, pagination/filter, retention and one-valid-price acceptance | `implemented_not_verified` |
| `MEM-CAL-001` | Plan-aware exact daily calendar and separately labelled monitoring extension in `Pacific/Auckland` | NZ-time/domain boundaries, owner-only API, no-fabrication data states and responsive browser QA | `verified` |
| `MEM-ALERT-001` | Host core alerts and Pro/Portfolio settings/controls behind entitlement and launch gates | Entitlement-aware unavailable state is implemented and browser-verified; delivery remains closed pending the documented alert gate | `verified_gated_off` |
| `MEM-PORT-001` | Pro/Portfolio view, bulk controls, exports and Portfolio API/webhooks | Portfolio/export/integration routes expose an honest entitlement/launch-gate state; no API or webhook secret is exposed while gates are closed | `verified_gated_off` |
| `MEM-BILL-001` | Stripe Checkout/Portal and persisted upgrade/downgrade/cancel/resume/grace reconciliation | Signed/idempotent test-mode webhooks, out-of-order events, browser flows and production configuration gate | `implemented_not_verified` |
| `MEM-RET-001` | Plan history, raw evidence, auth, billing, cancellation and deletion retention | Time-controlled isolated PostgreSQL lifecycle matrix | `implemented_not_verified` |
| `MEM-OPS-001` | Admin customer/membership/billing-event operations, safe reconciliation, session revoke, suspension and deletion support | Isolated PostgreSQL verifies unauthorised denial, audited plan/status corrections, session revoke, export completion evidence and minimised deletion; Stripe-backed manual drift fails closed | `verified` |
| `MEM-OBS-001` | Privacy-safe membership, billing, scheduler, queue, lifecycle and plan-economics telemetry | Worker health exposes aggregate plan/status/usage/unit/failure metrics without PII; production dashboard and injected-alert acceptance remain outstanding | `implemented_not_verified` |
| `MEM-A11Y-001` | Complete member module in EN/ZH at desktop, 390px and 320px | Manual semantic/overflow/responsive browser QA passed; a fresh axe/keyboard/reduced-motion membership run remains outstanding | `implemented_not_verified` |
| `MEM-E2E-001` | New Free, returning customer, paid lifecycle and every blocked/gated state | Returning Free real Mailpit/browser flow and all server/database gates pass; Stripe test-mode paid lifecycle and advanced-feature launch acceptance remain outstanding | `implemented_not_verified` |

The generally available Free customer module is implemented. Paid billing, production telemetry and complete accessibility/end-to-end launch evidence remain release gates, not claims of production readiness. Plan-specific features may remain unavailable only when the customer UI, API and marketing all enforce the corresponding documented Launch Gate; `verified_gated_off` means that closed state itself has been verified and the feature must not be marketed as available.

### Membership development verification (2026-08-10)

- Prisma Client generation and TypeScript checks passed for every workspace package.
- Web/domain/config/provider/database unit suites passed 199 tests; five external provider fixtures remained intentionally skipped. Worker unit suites passed 123 tests.
- A disposable PostgreSQL 18.3 database applied all 25 migrations from zero. The focused authentication, membership, Admin and session-security run passed all 16 tests; the preceding complete database run passed all 88 tests before the password-auth migration. The disposable container and database were removed afterwards.
- Web lint passed. The Web production build generated 101 pages and the Worker production build completed; only the existing optional LinkeDOM `canvas` warning appeared.
- Fresh real-browser acceptance covered account registration, automatic Free-account session, sign-out, password login with exact protected-route return, password change, old-password rejection and new-password login. Chinese copy and locale routing are implemented; the broader full membership accessibility matrix remains a separate gate.
- The development database applied migration `20260810210000_customer_data_request_resolution`. No Stripe production configuration, paid-plan launch, advanced-feature launch or production SLA is asserted by this evidence.

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
| `pnpm test` | Unit/domain and Worker suites | current worktree verified: 138 root tests (5 skipped external fixtures) plus 86 Worker tests |
| `pnpm test:integration` | Database/API/Worker integration | current worktree verified: 69 tests in an isolated database |
| `pnpm test:e2e` | Playwright and accessibility | full desktop and mobile suites passed: 9 tests per project, including axe and responsive checks |
| `pnpm build` | Production Web and Worker build | 65-page Web build and four Worker entrypoint builds verified; known optional LinkeDOM canvas warning only |
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
| OTA research adapters | Seven shared contract adapters, deterministic record/replay and stable errors | verified |
| Public signal lineage | RawArtifact -> SourceMarketSignal -> MarketSignal -> MarketSignalSourceLink | locally verified across holidays, ski seasons, DOC/Interislander alerts, GeoNet, MBIE ADP/TVF/MRTE/IVS, Stats NZ, MetService, NZTA, RBNZ FX, airport and port/cruise adapters |
| Public source adapters | Every configured public source ID uses a concrete official/public transport or a required Argus read-only Job; Christchurch sports, UC and Lincoln dates, racing, cruise and airport monthly sources are registered separately | implementations, live-source probes and bounded two-pass local acceptance verified; Lincoln contract, local evidence copy, ACK purge and idempotency verified on 2026-08-04; schedules remain disabled |
| New Zealand major-market coverage gate | 15-market executable matrix distinguishes official, demand, disruption, seasonal and local-flow layers and names every required source | 14 direct markets plus Dunedin's verified Argus path; DOC closures and ADP/TVF/MRTE route to all 15 markets, IVS/Stats provide national context, and MoT plus Auckland Airport passed repeat persistence |
| Nationwide resolved-address signal routing | LINZ free-text address search resolves standard geography before `FULL`, `REGIONAL` or `NATIONAL_ONLY`; 17 regions have explicit keys, non-major addresses run the 19-source national baseline, and coverage limitations are frozen into snapshots/results | 17-Region provider corpus; ambiguity/low-confidence/cross-region/expiry/concurrency regression; isolated PostgreSQL cache and confirmation-promotion tests; live Wellington query returned `source`, then `database` after Web restart with zero Property rows |
| Canonical event persistence | Source-normalised series/occurrences, exact canonical matching, venue linkage, idempotent repeat writes and preserved source state | verified by Worker unit tests and local database integration regression |
| Event impact evidence v2 | Versioned evidence validation, provenance/time precision, cross-source aggregation, trusted venue enrichment and conservative promotion | unit/integration verified; attendance or independent official-scale plus demand evidence can qualify; capacity-only and same-domain corroboration stay pending; one canonical signal retains all lineage |
| Local source acceptance standard | Development-only guard, hard-disabled development scheduler, bounded real collection, immutable run evidence, two-pass idempotency, retention, Redis lock, lease recovery, unchanged source configuration and full quality gate | verified and required for every implemented collection channel |
| Manual import local acceptance | Bounded operator-file parser, source/canonical accommodation persistence, immutable observation identity and evidence retention | implementation and fixture/database regression verified; genuine operator file and two-pass real-file evidence remain not_verified |
| Eventfinda browser collection | Nationwide discovery, detail frontier, persistence, retention and unattended stability | bounded acceptance and development-bootstrap implementation verified; nationwide run evidence is recorded in the source-specific document; unattended production evidence remains |
| Ticketmaster browser collection | Five-city discovery, durable detail frontier, bounded hydration, exact-target canonical persistence and cooldown | implementation and automated two-pass database acceptance verified; latest bounded live detail acceptance remained challenged and stopped without bypass |
| Source controls | Every environment requires enabled, operationally healthy sources; development additionally hard-disables automatic scheduling | verified by Worker unit and integration tests |
| Degraded source behavior | Optional source failure is audited while valid formal evidence can still complete | verified by Worker integration tests |
| Preview/formal pipeline | Two-date preview, 30-date formal result, multi-unit confirmation, cache reuse | verified by Worker integration tests |
| Email policy | Formal happy path creates and sends exactly one `RESULT_READY` delivery | verified by Worker integration and Mailpit smoke |
| Abuse controls | Idempotency, device/unit preview and formal email/unit limits recorded in usage/decision tables | verified |
| Retention | Redacted short-lived RawArtifact creation and expired payload deletion | verified |
| Failure controls | Redis lock contention/reacquisition, lease recovery only after expiry, retry schedule, dead-letter and blocking quality-gate tests | verified |
| Production fixture guard | Production config rejects both demo and fixture provider modes | verified |
| External live OTA collection | Tymra accepts strict public `resolve_listing`, `discover_listings` and `collect_rates` contracts for nine brands and routes each source only to its public connector; address-first checks discover at most eight comparables, preserve provider brand/family and never fall back to fixtures | Booking public-browser discovery/rate has real positive Wellington evidence, Tymra contract validation and verified ACK/purge; Expedia public search remains a separate public-source workflow. Partner APIs are deferred until credentials exist |
| Nationwide live panel | Schema, schedules and coverage operations exist; real 1,000-1,500 units require live catalog sources | external prerequisite |
| Quality baseline | Lint, workspace typecheck, 81 TypeScript unit/component tests, 34 browser runtime/extractor/Worker tests, 49 integration tests, 57-route Next.js production build and four Worker entrypoint builds pass; Next.js reports only LinkeDOM's unused optional-canvas warning | verified |
