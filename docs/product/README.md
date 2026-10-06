# Tymra product baseline

This directory is the canonical local product contract. The repository files are the only current
authority; there is no external-document fallback or legacy product baseline to preserve.

Product changes are made here first and reflected in `docs/decisions.md` and
`docs/traceability.md`. Git history is the change record; no external copy is an authority or
fallback.

## Company and brand context

Harold confirmed during the September 2026 workspace rebuild that Tymra and Synix are parallel
products owned by Spicy Maggie. Argus is a separate shared platform owned by the same company.
The existing wording and artwork “Tymra by Synix” describe branding; they do not establish a
parent/subsidiary product relationship, a legal entity or ownership of Tymra's customer data.
This workspace migration preserves existing product behaviour and artwork. Future endorsement,
copyright or public naming changes are product work, not an automatic consequence of moving files.

## Authority and scope

The current National Data Core v1.3 documents use this precedence:

1. `requirements.md` defines product scope and fixed technical defaults.
2. `data-core.md` defines the active nationwide collection, coverage, quality, history and lineage contract.
3. `business-rules.md` defines shared executable business objects, states and decisions.
4. `page-structure.md` defines customer routes, page regions and user flows.
5. `visual-interaction.md` defines visual tokens, components and interaction behaviour.

`membership-plans.md` owns commercial prices, Property-slot entitlements, quotas and member lifecycle.
`customer-funnel.md` owns password authentication, purpose-bound verification and anonymous-to-formal
flow. Page and visual documents reference these contracts rather than redefining them.

`core-strategy.md` is the separate data-collection and price-analysis strategy baseline. Where its
long-term nationwide direction exceeds a currently approved release, the release baseline,
`docs/decisions.md` and `docs/traceability.md` determine what is implemented and verified now.
Its platform direction defines New Zealand accommodation market intelligence as the current data
core and the member experience as the first commercial surface. The approved complete product uses
one production version for the nationwide backend, public Price Check, customer sign-in, membership, pricing, Stripe
billing and customer results. Client discovery starts as `DEPLOYED_HIDDEN`: homepage, public
navigation and marketing CTA entries are hidden while routes and backend capabilities remain
deployed and protected.
Possible future product surfaces do not become approved scope merely because they can reuse that
core.

## Approved target and operational stage

These files describe the approved product, not a live-service status report.
The initial production stage under D-051 exposes Admin only; customer routes, APIs and Stripe
webhooks remain closed by ingress/application controls. `DEPLOYED_HIDDEN` is different: it hides
discovery links while retaining protected direct routes. The complete client scope and its
production acceptance gates remain required before that access stage is enabled.

Use [traceability](../traceability.md) for recorded releases and gaps. On 2026-10-06 the docs were
aligned to existing approved decisions: password registration/sign-in, purpose-bound verification,
session-owned results, membership-owned quotas, actual application directories and Admin-only staging.
No new product scope or commercial term was introduced; baseline versions remain unchanged.
Retired narratives and document removals are summarized in [decisions](../decisions.md#文档与运行阶段变迁).
