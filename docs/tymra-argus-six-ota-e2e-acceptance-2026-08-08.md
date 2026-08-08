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

The final distinct workflow result was 10 successful workflows out of 12:

| Source | `resolve_listing` | `collect_rates` |
| --- | --- | --- |
| Booking.com | Passed | Passed (`NOT_LISTED`, no inferred price) |
| Airbnb | Passed | Passed (`AVAILABLE / BUNDLED / NZD 218.00`) |
| Expedia | Argus failed closed: no stable date-independent room identity | Passed (five public bundled rates) |
| Bookabach | Passed | Passed (`MINIMUM_STAY_RESTRICTION`, no inferred price) |
| Agoda | Passed | Argus failed closed: visible page did not produce a verified public rate-plan result |
| Trip.com | Passed | Passed (20 public bundled rate plans) |

Every delivered result, including conservative failure payloads, had HTML and screenshot evidence downloaded and checked against its byte length and SHA-256 before acknowledgement. ACK was followed by a remote result read returning HTTP 410. Two first-pass Booking/Trip resolve deliveries that were initially rejected by Tymra's stricter capacity schema were subsequently verified, acknowledged, and purged.

The E2E run exposed that Argus correctly preserves unknown public unit capacity as `null`. Tymra now accepts that wire value without inventing capacity, while refusing to persist the unit as a confirmed sellable unit until capacity is known. Mapping-invalid deliveries also retain their delivery metadata so evidence can still be retained and the remote result can be acknowledged and purged.

Acceptance artifacts are retained in the local `tymra_argus_evidence` volume under:

```text
/argus-evidence/ota-e2e-1786170864348-64472e2e
/argus-evidence/ota-e2e-1786171739288-fcbcc052
```

## Verification

- Tymra lint, workspace typecheck, unit tests, isolated PostgreSQL integration tests, Web production build, and Worker production build passed.
- Tymra unit tests: 182 root tests passed (5 fixture-only skips) and 111 Worker tests passed.
- Tymra isolated PostgreSQL integration tests: 74 passed, 0 failed.
- Argus tests with an isolated PostgreSQL database: 202 passed, 0 failed, 0 skipped, including all three PostgreSQL repository/lease tests.
- Final Compose worker readiness: database, Redis, and Argus healthy; `ready=true`.
- Argus health/readiness capacity probe: 20/20 succeeded at concurrency 5; p50 5 ms, p95 25 ms, maximum 48 ms.
- The initial 12-job OTA canary completed sequentially in 364,085 ms; average 30,340 ms and maximum 69,822 ms per Job. This is a development latency baseline, not a production capacity or SLA claim.

## Release boundary

Development technical preflight and the two-pass canary plan passed. Production release gates remain closed because the operational database does not yet contain the required two bounded persisted runs, positive listing/rate evidence, recent positive result, and approved lifecycle state for every OTA source. Airbnb is also still marked blocked in the current operational database.

No production schedule, lifecycle, or source status was changed by this acceptance. Expedia resolve and Agoda rate collection remain explicit Argus follow-up items; Tymra continues to fail closed and does not infer or persist their missing data.
