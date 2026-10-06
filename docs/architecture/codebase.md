# Tymra codebase structure

Last reviewed: 2026-10-07. Runtime versions, mounts and acceptance belong in
[traceability](../traceability.md), not this directory map.

## Workspace boundaries

- Engineering: `/Users/haroldchen/Development/tymra/repo`; select the actual Git worktree and
  inspect its branch/changes before editing.
- Business navigation and original source material:
  `/Users/haroldchen/Library/Mobile Documents/com~apple~CloudDocs/Workspaces/tymra`.
- Manual linked worktrees: `/Users/haroldchen/Development/tymra/worktrees/<topic>`;
  app-managed worktrees follow the saved app setting. Isolate Compose identities, ports and data.
- Credentials, dependencies, runtime data and evidence stay in their local/protected engineering
  locations. The iCloud entry is not a second checkout or runtime backup.
- Workspace migration and retired launchers are historical; recovery uses the existing
  [Life recovery guide](</Users/haroldchen/Development/life/work-environment/chatgpt-rebuild/备份恢复说明.md>).
  Recheck recoverability before use rather than assuming an old backup description is current.

## Applications and packages

```text
apps/
  web/                          Next.js public, member, Admin and HTTP API
    components/home/            homepage sections and search state hook
    components/public/          anonymous customer funnel
    components/member/          account, report and membership components
      portal/                   history, units, calendar, billing, settings and feature gates
    lib/server/admin-resources.ts typed Admin resource queries
    components/admin/membership/ operator membership UI
    lib/server/membership/      authentication, entitlement, risk and billing
  worker/                       durable jobs, API, scheduler, CLI and collection
    src/services/worker-service.ts public service facade
    src/services/worker/        typed request, pricing, catalog and operations modules
      collection/              source orchestration, transports and persistence
    src/jobs/handlers/          pricing, collection, notifications, coverage and failure handling
    src/operations/schedule-policy.ts approved schedule classification and source policy
    src/membership/             member scheduling, retention and aggregate metrics
    src/services/ota-pricing-orchestrator.ts
                                address discovery, comparable identity and rates
packages/
  config/                       validated runtime configuration
  db/                           Prisma schema, migrations and persistence
  domain/                       pure contracts and policy
  providers/                    explicit adapter and contract entrypoints
    src/public/                 direct public adapters, shared parsers and Worker registry
  queue/                        durable queue primitives
```

Dependencies flow from applications to shared packages. `domain` must not import application or
database code. Adapters emit domain contracts; database writes belong to the persistence boundary.
Browser execution is external through [Argus](../collection/argus.md); there is no private Browser
Worker or marker-only UI package.

`tsconfig.base.json` contains shared TypeScript settings; each project selects any DOM libraries it
needs, while Next.js plugins and Web aliases belong to Web. `pnpm typecheck` checks all workspace packages and applications,
then root scripts and test configuration. `scripts/check-boundaries.mjs` enforces the dependency
direction and keeps server infrastructure out of client components.

## Feature ownership

- Customer authentication, entitlement, quota, risk and Stripe reconciliation live in
  `apps/web/lib/server/membership`; routes validate transport and delegate.
- Admin membership operations use Admin sessions. Customer sessions grant no Admin authority.
- A member pricing slot represents one real Property; matched addresses, OTA listings and
  provider room identifiers do not consume extra slots.
- Global tokens, public responsive rules and reduced-motion defaults live in
  `apps/web/app/globals.css`. Locale layouts load `customer-funnel.css`, account layouts load
  `member-account.css`, and Admin layouts load `admin.css`. Public pages must not rely on Admin
  stylesheet loading. Preserve cascade order when moving shared rules.
- Homepage search state and submission live in `components/home/useHomeSearch.ts`; presentation
  sections use that explicit contract. Member feature files import their own contracts and helpers,
  without a compatibility view barrel. Admin rendering delegates persistence queries to
  `lib/server/admin-resources.ts`.
- Worker member retention and operational aggregates live in `src/membership/operations.ts`.
  OTA pricing orchestration and shared price semantics live in `src/services`.
- Provider imports select named package subpaths rather than a root export-all barrel.
  `packages/providers/src/contracts.ts` owns the common provider interface;
  `src/public/registry.ts` assembles direct public adapters for Worker execution. Email consumers
  use the email entrypoint without loading spreadsheet or collection adapters.
- Public event/Argus adapters remain in `packages/providers/src/public-event-web-adapters.ts`.
  Source definitions live in `packages/db/prisma/seed-sources.ts`; seed orchestration stays in
  `seed.ts`. Seed is development setup, not a production source migration.

## Test runtime

`test/isolation.ts` validates disposable database/Redis and dedicated Compose identities before
test setup writes. Browser setup uses `test/runtime-environment.ts` and the standalone
`docker-compose.test.yml`; it owns its ports, fixture credentials, network and disposable volume.
It does not rebuild or seed the daily development stack. The root [verification guide](../../README.md#verification)
documents guarded integration, isolated builds and separately authorised external acceptance.

## Documentation and generated files

The [document index](../README.md) assigns one authority to each concern. Dated evidence proves
its named candidate and environment only. Build output, caches, `dist`, `.next*` and coverage
are generated artifacts; numbered copies such as `Component 2.tsx` are not supported source variants.
Retired structures are summarized in [decisions](../decisions.md#文档与运行阶段变迁).
