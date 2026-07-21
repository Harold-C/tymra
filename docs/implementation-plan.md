# Tymra Release 1 And 1.5 Implementation Plan

Last updated: 2026-07-16

## Baseline

The authoritative baseline is **Tymra Release 1 Codex Build Baseline v1.1**, dated
2026-07-14. The four source documents were read through the connected Google Drive
account before implementation began.

| Document | Revision | Read status |
| --- | --- | --- |
| 需求说明 | `ALtnJHz3fjbb6O4BV4fjfhrSTXDZ1ku75qDU3Ah3I7XpRsZHD3RdfEVqc_-8EWcSsoI0ANpg6rBvct9xV93V-g` | Complete |
| 业务规则 | `ALtnJHx_Np_qwvFYiIDRPDJWx4F5qn-HlMEaPMvwdq2nsa7kqSAuD8sZCJvhlf4DEc8iWoRSlRfecfs3ckf-hA` | Complete |
| 页面结构 | `ALtnJHw1ekka4RKJAUIfZyVpT4lU5EaLnjNNcwRiC7stz4YMhHptoGk7TcGhlDYmrNsQye92tkfuC7N7pAb9mA` | Complete |
| 视觉交互 | `ALtnJHwtf19mqHO6_tysqsC-Zy4oQgamDqWlSEPmIKdYjHj_mYWCioN7Cw5ro9CoUsePuo8_O3hr_uB46sL2fA` | Complete |

Conflict order: requirements, business rules, page structure, visual interaction.

### Release 1.5 approved amendment

[Release 1.5 customer funnel requirements](release-1.5-customer-funnel.md) is the approved product baseline for the next release. It
defines anonymous rough value, customer magic-link authentication, formal-check ownership, minimal
email and layered abuse controls. D-025 additionally records the approved requirement for a
supported OTA listing URL with automatic URL/default-context resolution and no anonymous date,
guest-count or room-type controls. The core new-visitor funnel is implemented and locally verified;
remaining hardening gates are listed requirement by requirement in `traceability.md`.

## Repository Audit

### Current state

- Existing application: a single Next.js 14 App Router application at the repository root.
- Package manager: pnpm lockfile present; root package did not declare a pinned package manager.
- Existing product surface: Phase 0 English and Chinese home pages, a canvas signal visual,
  local preview-only validation and historical Playwright screenshots.
- Existing data layer: none.
- Existing API and worker: none.
- Existing tests: Playwright is installed, but no runnable test scripts or test sources exist.
- Existing Docker and CI: none.
- Existing environment contract: none.
- Existing brand asset: `public/tymra-logo.png`; the baseline asks for an SVG when a formal
  asset is supplied, so the text fallback remains the safe implementation default.
- Existing local access: `https://tymra.test` is routed by the shared host Traefik instance to
  host port 3000. A user LaunchAgent currently keeps the Phase 0 Next.js dev server running.
- Verification at audit time: `https://tymra.test` returned HTTP 200 and port 3000 was listening.
- Build verification initially failed because the interactive shell has no system `node` on
  `PATH`; only the Codex bundled runtime and Docker currently provide Node.js.

### Reusable code

- Preserve the established visual direction, copy source, reduced-motion handling and canvas
  concept where they remain compatible with Release 1.
- Replace all preview-only state, fake timing and Phase 0 claims with real persisted workflows.
- Split the 1,300-line home component as Release 1 features are introduced; do not rewrite the
  visual layer before shared contracts and real data paths exist.

### Referenced local conventions

The neighbouring LittleQuest and Synix projects establish these local habits:

- workspace package boundaries and root orchestration scripts;
- explicit package-manager and engine contracts;
- Docker Compose services with health checks, named volumes and `restart: unless-stopped`;
- shared host Traefik for `.test` domains;
- environment examples without credentials;
- shared database/config packages and repeatable migration/seed commands.

Tymra uses PostgreSQL as the persistent job system of record and Redis for distributed collection
locks and ephemeral coordination. A Redis outage cannot erase queued work.

## Target Architecture

```text
apps/
  worker/             PostgreSQL-backed job processor
packages/
  config/             environment schema and operational defaults
  db/                 Prisma client, schema, migrations and deterministic seed
  domain/             canonical enums, schemas, state transitions and decisions
  providers/          provider contracts, Demo and Manual Import providers
  queue/              Redis locks, cache helpers and readiness
  ui/                 shared UI primitives and domain presentation components
app/                  existing Next.js web application, API routes and admin routes
components/           existing web-only components during incremental migration
docs/                 controls, architecture, provider and operations documentation
```

The existing root web app is intentionally retained rather than moved mechanically. It remains
a pnpm workspace root and consumes shared workspace packages.

Worker Baseline v1 additionally provides a Fastify Worker API, database-backed scheduler
definitions, seven OTA research adapters, national public-signal adapters and the versioned
Observation -> Snapshot -> PriceAnalysis -> ResultVersion pipeline. See `worker-baseline-v1.md`.

Release 1.5 extends this architecture with customer identity, anonymous rough checks, rough-result
caching, usage accounting and abuse decisions. These additions must remain separate from Admin
authentication and from immutable Release 1 result history.

## Delivery Phases

| Phase | Scope | Status | Verification gate |
| --- | --- | --- | --- |
| 0 | Baseline reading and repository audit | Complete | Four revisions recorded; runtime checked |
| 1 | Control documents and workspace foundation | Complete | Workspace install and package typechecks passed |
| 2 | Canonical domain, configuration and database | Complete | Empty-volume migration, 19 unit tests, repeatable seed |
| 3 | Providers, queue, worker, email and secure links | Complete | Job lease/retry, provider, link and email tests passed |
| 4 | Public API and bilingual Price Check flow | Complete | API integration and EN/ZH Playwright flows passed |
| 5 | Admin authentication, Exception Inbox and operations | Complete | Auth, Admin API, exception and workspace checks passed |
| 6 | Docker, CI, documentation and complete QA | Complete | `pnpm verify`, clean Compose, Mailpit, browser and axe passed |

## Release 1.5 Delivery Plan

Release 1 remains complete. The following phases are new work and must not be reported as Release 1
acceptance evidence.

| Phase | Scope | Current status | Verification gate |
| --- | --- | --- | --- |
| 1.5-0 | Product approval, copy approval and quota/retention defaults | Complete | Approved requirements and D-015 through D-025 recorded |
| 1.5-1 | Domain states, customer/session/magic-link/rough-result/usage schema and migrations | Complete | Migration deployed; Prisma validation, typecheck and build pass |
| 1.5-2 | Supported OTA URL normalization, listing/default-context resolution, aggregate rough analysis and six-hour cache | Complete | 7 resolver tests, isolated cache integration and EN/ZH responsive E2E |
| 1.5-3 | Magic-link issuance, verification, neutral responses and customer sessions | Core complete | Valid-link E2E passes; replay, expiry and timing-class hardening remains |
| 1.5-4 | Ownership binding, authenticated formal checks, account history and report guards | Complete | Owner/cross-account/unauthenticated integration and account E2E pass |
| 1.5-5 | Conditional email policy and active-page result suppression | Complete | Mailpit proves one verification email and no terminal duplicate after acknowledgement |
| 1.5-6 | Usage ledger, configurable quotas, risk outcomes, challenge and cleanup jobs | Partial | Cache/cooldown/device limit pass; challenge, quota matrix and cleanup jobs remain |
| 1.5-7 | Real-state motion, reduced motion, responsive and accessible customer experience | Core complete | Chrome plus 16 desktop/mobile E2E pass; dedicated reduced-motion automation remains |
| 1.5-8 | Feature-flag migration, legacy-link coexistence, operations and complete QA | Partial | Migration, legacy links, build and E2E pass; feature flag and rollback exercise remain |

### Recommended implementation sequence

1. Approve the product baseline before changing Release 1 routes.
2. Add customer identity and anonymous-check schema without assigning ownership to historical data.
3. Implement supported OTA URL normalization and automatic URL/default-context capture without
   anonymous date, guest or room selection.
4. Implement rough analysis and prove invalid or non-price-bearing listings terminate honestly and
   cannot enqueue formal provider work.
5. Implement magic-link verification and customer sessions with Admin isolation.
6. Bind verified anonymous checks and start account-owned formal work.
7. Move new reports behind authenticated ownership checks.
8. Replace the four-email happy path with conditional verification and terminal emails.
9. Add risk, challenge, quota and retention enforcement before enabling the public feature flag.
10. Run the complete migration, security, accessibility and responsive acceptance matrix.

## Module Dependencies

1. `config` and `domain` are dependency roots.
2. `db` depends on `config` and canonical values from `domain` at application boundaries.
3. `providers` depends on `domain` and has no web dependency.
4. Worker depends on `config`, `domain`, `db` and `providers`.
5. Web and API routes depend on all shared packages; business decisions remain server-side.
6. `ui` depends only on presentation-safe domain types and is shared by public and admin pages.

Release 1.5 dependency rules:

7. Anonymous rough analysis may depend on approved aggregate evidence but cannot enqueue the formal
   provider pipeline.
8. Customer authentication is a separate server boundary from Admin authentication.
9. Formal check creation depends on a verified customer session and a successful quota decision.
10. Email delivery depends on an idempotent notification decision, not directly on every status
    transition.
11. Abuse evaluation precedes magic-link send and formal job enqueueing.
12. Anonymous pricing analysis requires a normalized supported platform and listing ID. Property
    names and natural addresses cannot directly enter the rough-analysis boundary.
13. The listing resolver consumes supported URL pricing context when present and otherwise captures
    the OTA default display context. It persists only sanitized context and never requires anonymous
    date, guest-count or room-type selection.

## Risks And Controls

| Risk | Control |
| --- | --- |
| No approved production rate provider | Manual Import is the production-capable path; public checks return `SOURCE_UNAVAILABLE` until an approved source exists |
| Demo data leaking into production | Environment validation, runtime guard and production build/start checks |
| State or enum drift | One domain package imported by API, worker, UI mappings and tests |
| Existing Phase 0 fake progress | Remove preview resolver and timers when the persisted check flow is connected |
| Local Node runtime is not stable | Docker Compose becomes the durable runtime; host commands remain optional |
| Large Release 1 surface | Trace every capability to code and at least one automated test; verify by phase |
| Data history accidentally overwritten | Append-only tables, immutable result versions and database integration tests |
| Secrets or result tokens exposed | Hash stored tokens and access keys; redact logs and page metadata |
| Rough result becomes a deceptive teaser | Contract tests require real fields, freshness, confidence and explicit limitations |
| Natural addresses or unsupported URLs produce meaningless comparisons | Only a resolvable supported OTA platform and stable listing ID can start pricing analysis |
| OTA default configuration changes or selects an unexpected room | Persist and disclose the actual observed context and capture time; never imply all-room coverage |
| OTA default view contains no valid quote | Return `NO_DEFAULT_QUOTE` or an equivalent terminal state without fabricating a price |
| Submitted OTA URL leaks tracking or sensitive parameters | Normalize the listing ID and retain only allowlisted pricing-context fields before logs, persistence, cache or analytics |
| Anonymous requests consume formal provider cost | Formal enqueue requires verified customer or eligible authenticated session |
| Customer gains Admin access | Separate models, cookies, guards and negative authorization tests |
| Magic links create duplicate accounts/checks | Single-use token plus transactional idempotent verification |
| Email bombing or four-message happy path | Target/email/IP cooldown, neutral responses and conditional notification policy |
| Shared-network users are blocked | IP is a risk signal but never the only blocking key; challenge before block |
| Bearer links leak account reports | Session ownership guards; legacy links remain bounded and unowned |
| Motion misrepresents processing | Motion maps to persisted states and cannot delay or block ready output |
| Retention exceeds purpose | Scheduled expiry and de-identification tests against approved periods |

## Final Verification Status

- Baseline documents and conflict order: verified.
- All required public and Admin routes: implemented and exercised.
- Empty PostgreSQL volume: both migrations deployed automatically by Compose.
- Deterministic seed: executed repeatedly on host and twice against the clean Compose volume.
- Persistent Worker: job leasing, recovery, retry and idempotency integration tests passed; host
  LaunchAgent and Compose Worker both observed running.
- Local email: SMTP delivery to Mailpit was performed and the Chinese service message was visible.
- Automated checks: lint, typecheck, 26 unit tests, 24 integration tests, 16 Playwright tests and
  production Web/Worker builds passed.
- Accessibility: no critical or serious axe findings in the tested public and Admin views.
- Responsive QA: 1440x900 and 390x844 browser projects plus 320x568, 430x932, 768x1024,
  1024x768 and 1280x800 overflow checks passed.
- Docker Compose: built from a clean context and independent empty volume; PostgreSQL and Web were
  healthy, Worker was running without restart, and public Web, Admin and Mailpit returned HTTP 200.
- Persistent local access: `https://tymra.test/en` returned HTTP 200 after restoring the Web,
  Worker and 60-second health-check LaunchAgents.

## Completion

Release 1 local code scope is complete. Remaining launch gates are external inputs only: an
approved production data source, production domain, production email service, final legal text,
retention approval and formal SVG logo asset.

Release 1.5's **core new-customer funnel is implemented and locally verified**: OTA-only input,
anonymous rough value, one verification email, customer creation/session, formal check, account-owned
report and in-page email suppression. Release hardening is still open for interactive challenge,
retention cleanup jobs, safe funnel analytics, complete quota/session boundary matrices and rollback.
The exact remaining evidence is maintained in `traceability.md` and is not treated as complete.
