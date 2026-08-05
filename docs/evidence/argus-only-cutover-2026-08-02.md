# Argus-only cutover acceptance

Date: 2026-08-02 (New Zealand runtime crossed midnight on 2026-08-03)

## Scope

This acceptance removed Tymra's Browser Worker fallback and verified Argus as the required browser
execution dependency. The Scheduler remained disabled and every real-source check was bounded.

## Automated regression

- TypeScript typecheck passed for all seven workspace projects.
- Root unit tests passed 79/79; Worker unit tests passed 42/42 after the evidence fail-closed case was added.
- Database integration passed 53/53, including Ticketmaster listing-first/cancellation/challenge logic,
  Eventfinda discovery/detail persistence, RBNZ normalisation, API contracts, locks and immutability.
- Web lint and Web/Worker production builds passed. The existing optional `linkedom`/`canvas` warning
  remained non-fatal.

## Real bounded collection

| Source | CollectionRun | Result |
| --- | --- | --- |
| RBNZ | `cmsbrpp7k0001qb3r4yegztn3` | one page, two signals, zero failures |
| Eventfinda | `cmsbrq3vb0001qb53e7oy2luu` | one of 188 pages, 20 cards/discoveries, zero failures |
| Ticketmaster | `cmsbrqgh60001qb6fkqoqfy9a` | one city page, 19 discoveries, two accepted listing records, two detail requests avoided, no challenge |
| OurAuckland | `cmsbrr40q0001qb7r9te9j0j6` | one listing plus two details, two events, zero failures |

These four checks used development local-acceptance bounds and dry-run persistence.

## Restart, evidence and ACK

Queued RBNZ parent Job `cmsbrstkg0000s62bj6d903q2` submitted Argus Job
`job_367a2553bfee5237b37c31f456387eda`. The Worker was restarted while Argus was `RUNNING`.
The existing execution resumed and completed without a second submission. CollectionRun
`cmsbrstux0001s60oouxuzsr0` persisted two signals and zero failures.

Before ACK, Tymra downloaded and integrity-checked:

- HTML: 1,109,633 bytes, stored as `tymra-evidence:.../page.html`.
- Screenshot: 784,947 bytes, stored as `tymra-evidence:.../screenshot.png`.

Both Admin content endpoints returned HTTP 200 with the expected media types. After ACK, the Argus
result endpoint returned HTTP 410, proving the remote result was purged only after Tymra retained its
own evidence copy.

## Cancellation and health

Queued RBNZ parent Job `cmsbrv4lb0000s62nm6b1r88j` was cancelled while its Argus execution was
active. `ArgusExecution` and `CollectionRun` both settled as `CANCELLED`.

The rebuilt Worker health and readiness endpoints returned HTTP 200 with Argus
`healthy=true` and `ready=true`; Scheduler remained disabled. Admin rendered Argus as `HEALTHY` and
showed both the successful and cancelled collection runs.

The old Browser Worker evidence volume contained zero files. The old profile volume contained five
encrypted browser profiles and no business evidence. The two Browser Worker containers, both old
volumes and both dedicated browser networks were removed.
