# Acceptance evidence index

Dated records prove only their named candidate, environment, source and run. Their old schedule,
image, availability and pending-work statements are historical, not instructions to operate today's
system. Current state belongs in [traceability](../traceability.md), next steps in
[the implementation plan](../implementation-plan.md).

On 2026-10-06 superseded handoffs, frozen-candidate instructions and first-batch preparation/status
pages were removed. Their material conclusions and Git recovery reference remain in
[the evolution record](../decisions.md#文档与运行阶段变迁). Independent acceptance records below
retain their historical results; this index is the only directory-wide list.

## Production acceptance and recovery

- [Restricted Tymra–Argus production acceptance — 2026-09-24](tymra-argus-production-acceptance-2026-09-24.md)
- [Public canary — 2026-09-25](public-canary-production-2026-09-25.md)
- [ChristchurchNZ incremental collection — 2026-09-25](christchurchnz-incremental-2026-09-25.md)
- [Five-source safety — 2026-09-25](five-source-safety-2026-09-25.md)
- [Bounded public-source rollout — 2026-09-27](public-source-production-rollout-2026-09-27.md)
- [Suspended public-source repair — 2026-09-27](public-suspended-repair-production-2026-09-27.md)

Later October releases are summarized in [traceability](../traceability.md), with their protected
runtime receipt and recovery locations. A Git commit reference does not prove those external
artifacts remain present; verify them before recovery.

## Argus and OTA contract evidence

- [ACK and purge — 2026-08-01](argus-023-acceptance-2026-08-01.md)
- [Connector schema — 2026-08-02](argus-connector-schema-acceptance-2026-08-02.md)
- [OurAuckland / ARGUS-025–030 — 2026-08-02](argus-025-030-acceptance-2026-08-02.md)
- [Argus-only cutover — 2026-08-02](argus-only-cutover-2026-08-02.md)
- [Six-OTA end-to-end — 2026-08-08](tymra-argus-six-ota-e2e-acceptance-2026-08-08.md)
- [OTA soak cycle 2 manual waiver — 2026-08-21](ota-soak-cycle-2-manual-waiver-2026-08-21.md)

The waiver documents a specific exception, not natural-cycle success or approval for future runs.

## Public-source contracts and persistence

- [Collection baseline — 2026-07-21](collection-acceptance-2026-07-21.md)
- [Configured public sources — 2026-07-30](public-source-acceptance-2026-07-30.md)
- [Lincoln key dates — 2026-08-04](lincoln-key-dates-acceptance-2026-08-04.md)
- [Christchurch priority sources — 2026-08-04](christchurch-priority-sources-acceptance-2026-08-04.md)
- [Event impact — 2026-08-05](event-impact-acceptance-2026-08-05.md)
- [Major-market public signals — 2026-08-06](nz-major-market-public-signals-acceptance-2026-08-06.md)
- [Public signals P0–P2 — 2026-08-09](tymra-public-market-signals-p0-p2-2026-08-09.md)

## Client and release-tooling evidence

- [Release 1.5 hardening — 2026-08-05](release-1-5-hardening-2026-08-05.md)
- [Operational hardening — 2026-08-06](operational-hardening-acceptance-2026-08-06.md)
- [Production-readiness tooling — 2026-08-06](production-readiness-tooling-2026-08-06.md)
- [Free member E2E — 2026-08-11](free-member-end-to-end-acceptance-2026-08-11.md)
- [Stripe Sandbox lifecycle — 2026-08-12](stripe-sandbox-membership-lifecycle-2026-08-12.md)

Development and Sandbox evidence does not certify live billing, current customer ingress or a
changed candidate's full browser matrix.

## Supporting source artifacts

The [five-source baseline JSON](first-five-cycle-baseline-2026-09-25.json) is retained for the
historical read-only evaluator; its exact scope is documented in
[collection acceptance](../collection/acceptance.md#历史五来源评估器的适用范围).
The three Ticketmaster PNGs are original dated capture evidence, linked from
[the source contract](../collection/ticketmaster.md#verification). No raw source artifact was
removed as part of this document cleanup.
