# Tymra → Argus six-OTA E2E acceptance — 2026-08-08

## Scope

The active OTA collection scope is limited to:

```text
booking, airbnb, expedia, bookabach, agoda, trip
```

`wotif`, `hotels`, and `vrbo` remain compatibility-only and are excluded from active scheduling, health evaluation, and release requests.

The acceptance used public, signed-out, read-only browser collection for the target Christchurch properties with:

```text
check-in:  2026-08-14
check-out: 2026-08-15
adults:    2
children:  0
units:     1
currency:  NZD
```

## Cross-service result

The original canary produced 10 successful workflows out of 12. After the Argus Expedia and Agoda fixes at commit `2c6a1f352c6441fd4b1c0bd1dd768a23e7293ffb`, Tymra repeated both workflows for both sources. The final distinct workflow result is 12 successful workflows out of 12:

| Source | `resolve_listing` | `collect_rates` |
| --- | --- | --- |
| Booking.com | Passed | Passed (`NOT_LISTED`, no inferred price) |
| Airbnb | Passed | Passed (`AVAILABLE / BUNDLED / NZD 218.00`) |
| Expedia | Passed at property scope (`unitIdentityStatus=not_public`, no invented room) | Passed (five public bundled rates) |
| Bookabach | Passed | Passed (`MINIMUM_STAY_RESTRICTION`, no inferred price) |
| Agoda | Passed | Passed (20 public signed-out partial nightly rates, no inferred stay total) |
| Trip.com | Passed | Passed (20 public bundled rate plans) |

Every delivered result, including conservative failure payloads, had HTML and screenshot evidence downloaded and checked against its byte length and SHA-256 before acknowledgement. ACK was followed by a remote result read returning HTTP 410. Two first-pass Booking/Trip resolve deliveries that were initially rejected by Tymra's stricter capacity schema were subsequently verified, acknowledged, and purged.

The E2E run exposed that Argus correctly preserves unknown public unit capacity as `null`. Tymra now accepts that wire value without inventing capacity, while refusing to persist the unit as a confirmed sellable unit until capacity is known. Mapping-invalid deliveries also retain their delivery metadata so evidence can still be retained and the remote result can be acknowledged and purged.

Acceptance artifacts are retained in the local `tymra_argus_evidence` volume under:

```text
/argus-evidence/ota-e2e-1786170864348-64472e2e
/argus-evidence/ota-e2e-1786171739288-fcbcc052
/argus-evidence/ota-e2e-1786228279582-1a6f386a
```

The follow-up run executed four real jobs: `resolve_listing` and `collect_rates` for Expedia and Agoda. All four passed Tymra schema and semantic checks, copied and verified required HTML and screenshot evidence, used the exact result hash for ACK, reached `PURGED / ACKNOWLEDGED`, and returned HTTP 410 when evidence was read after purge.

- Expedia resolution returned stable property identity `expedia:18258191`, `unitIdentityStatus=not_public`, `quality=partial`, and `units=[]`. Tymra treats this as a property-only match, does not manufacture or persist a `SellableUnit`, and returns `UNIT_IDENTITY_NOT_PUBLIC` for room-level validation.
- Expedia collection returned five public `AVAILABLE / BUNDLED / PUBLIC_SIGNED_OUT` rates.
- Agoda resolution returned eight public units.
- Agoda collection returned 20 stable `AVAILABLE / PARTIAL / PUBLIC_SIGNED_OUT` rate plans. Public nightly prices ranged from NZD 269.00 to NZD 403.00 and every `totalPriceMinor` remained `null`.
- Expedia resolution evidence: HTML `06dce8b98934b5e7a76ff9565c853285bbfa2f41e2ead536bc50192b9c45b835`; screenshot `98d2085f477617cc1e3c30b4a46726170783b0f90fec99b3629bff1917a6d649`.
- Agoda rate evidence: HTML `24f9248d712b4eae440bc22fdebb7c38355554969b9da2be564a67dbec54af89`; screenshot `6300db69f7160b8cbaa1f0944faea69b9b40f07164ff4403e6e1cbe9596a9b8d`.

## Verification

- Tymra lint, workspace typecheck, unit tests, isolated PostgreSQL integration tests, Web production build, and Worker production build passed.
- Tymra unit tests: 184 root tests passed (5 fixture-only skips) and 113 Worker tests passed.
- Tymra isolated PostgreSQL integration tests: 75 passed, 0 failed, including the Expedia property-only persistence guard.
- Argus tests with an isolated PostgreSQL database: 208 passed, 0 failed, 0 skipped, including all three PostgreSQL repository/lease tests.
- Final Compose worker readiness: database, Redis, and Argus healthy; `ready=true`.
- Argus health/readiness capacity probe: 20/20 succeeded at concurrency 5; p50 5 ms, p95 25 ms, maximum 48 ms.
- The initial 12-job OTA canary completed sequentially in 364,085 ms; average 30,340 ms and maximum 69,822 ms per Job. This is a development latency baseline, not a production capacity or SLA claim.

## Release boundary

Development technical preflight and the six-OTA canary plan passed. Production release gates remain closed because the operational database does not yet contain the required two bounded persisted runs, positive listing/rate evidence, recent positive result, and approved lifecycle state for every OTA source. Airbnb is also still marked blocked in the current operational database.

No production schedule, lifecycle, or source status was changed by this acceptance. There are no remaining Argus connector follow-up items in the agreed six-OTA development scope. Tymra continues to fail closed when a provider does not publish a physical unit identity or a complete stay total.
