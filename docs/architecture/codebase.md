# Tymra codebase structure

Last updated: 2026-08-11

## Runtime and package boundaries

```text
apps/
  web/                         Next.js public, member, Admin and HTTP API surfaces
    app/[locale]/account/      authenticated member routes
    components/member/         member-facing UI
    components/admin/membership/ operator-only membership UI
    lib/server/membership/     authentication, entitlement, risk and billing services
  worker/                      durable jobs, collection and Argus orchestration
    src/membership/            membership scheduling, retention and aggregate operations metrics
    src/services/ota-pricing-orchestrator.ts
                               address discovery, comparable identity and public OTA rate persistence
packages/
  config/                      validated runtime configuration
  db/                          Prisma schema, migrations and persistence helpers
  domain/                      pure contracts and policy
  providers/                   source adapters and normalisation
  queue/                       durable queue primitives
docs/
  product/                     authoritative product contracts
  architecture/                current code and runtime boundaries
  collection/                  source contracts and acceptance rules
  evidence/                    dated, immutable acceptance snapshots
```

The repository intentionally has no private Browser Worker, browser-runtime package or marker-only
UI package. Argus owns browser execution; reusable Web UI stays with its actual application
consumer.

Dependencies flow from applications to shared packages. `domain` must not import application or
database code. Provider adapters emit domain contracts; persistence remains in `db`; browser work is
performed by Argus and reached through the Worker boundary.

## Membership ownership

- Public/anonymous funnel UI stays in `components/public`; authenticated account UI stays in
  `components/member`.
- Customer authentication, entitlement, quota, risk and Stripe reconciliation stay under
  `lib/server/membership`. Route handlers validate transport concerns and delegate to this layer.
- Admin membership operations are isolated under `components/admin/membership` and protected by the
  existing Admin session. Customer sessions never grant Admin access.
- A pricing unit represents one real Property whether it began as an OTA URL or a street address.
- Member account workspace styles and the public customer-funnel styles live in separate CSS
  surfaces (`member-account.css` and `customer-funnel.css`) so changes to one surface can be
  reviewed without scanning the other.
  OTA listings and provider-specific room identities do not consume extra property slots.

## Generated and historical files

Build output (`.next*`, `dist`, coverage and caches) is generated and must not be treated as source.
Numbered copies such as `Component 2.tsx` are not valid source variants. Dated files under
`docs/evidence` are historical snapshots; current status belongs in `docs/traceability.md`.

## Decomposition status

The first behaviour-preserving split is complete:

- shared/public CSS remains in `app/globals.css`; member and Admin surfaces live in
  `styles/member.css` and `styles/admin.css` with import order preserved;
- membership retention and privacy-safe operational metrics live in `worker/src/membership/operations.ts`;
- generic public event/Argus web adapters live in `public-event-web-adapters.ts` behind the unchanged registry;
- deterministic source definitions live in `prisma/seed-sources.ts`, while orchestration remains in `seed.ts`.
- address-based OTA discovery and price persistence live in `worker/src/services/ota-pricing-orchestrator.ts`;
  shared public-price semantics live in `worker/src/services/ota-price.ts`.

Further Worker/source-family decomposition is allowed only as independently reviewed changes with
the current feature, seed-idempotency and integration suites held constant.
