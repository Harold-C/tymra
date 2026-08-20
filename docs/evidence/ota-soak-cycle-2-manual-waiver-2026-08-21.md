# OTA soak cycle 2 manual waiver — 2026-08-21

## Decision

The product owner cancelled OTA soak cycle 2 on 2026-08-21 (`Pacific/Auckland`) and approved
continuing the development release process with a manual waiver. This is a release-risk acceptance,
not an automated soak pass. The machine checkpoint remains unchanged and must not be edited to
claim observations that did not occur.

## Machine evidence retained

The ignored local checkpoint at `output/soak/ota-argus-checkpoint.json` recorded:

- active sources: Booking.com, Airbnb, Expedia, Bookabach, Agoda and Trip.com;
- configured cycles: 2;
- completed cycles: 1;
- successful New Zealand dates: `2026-08-17`;
- cycle 1 duration: 942,644 ms;
- cycle 1 result: passed with a 0% observed failure rate;
- release fingerprint: `dc3b69cc804f9ef97d950176ff8cdbb9d8d3c990323e0a99719b697c5f94a610`;
- result fingerprint: `cd69a4feca6ad2d3380e3c869799f0874f6b55f45c70c9132dfd48ea67289752`;
- `completedCycles=1`, `elapsedWindowMs=0` and `stable=false`.

No cycle 2 process was running when cancellation was confirmed. No second-day result, second-cycle
release identity, 24-hour elapsed window or cross-cycle stability result exists.

## Scope of the waiver

The waiver permits the current development candidate to proceed through the normal release-level
regression and push workflow despite the missing cycle 2 observation. It does not:

- convert the checkpoint to `stable=true`;
- prove two different New Zealand calendar days or an elapsed window of at least 86,400,000 ms;
- prove production capacity, long-term OTA page stability or an SLA;
- authorize production Scheduler activation or an unattended all-source rollout;
- replace target-environment health, migration, browser, monitoring or rollback gates.

The earlier expected frozen identity and the retained checkpoint fingerprint are not the same.
Therefore the missing second-cycle identity comparison is an accepted residual risk, not evidence of
release continuity.

## Compensating controls

Before push, the candidate must pass the repository release gate, including static checks, isolated
database integration, production builds, the five-browser read-only canary, the Chromium functional
baseline and canonical `https://tymra.test` browser QA. Failures remain release-blocking.

For a future production rollout:

1. keep the Scheduler disabled during deployment and read-only verification;
2. verify the deployed Git SHA, image identity, database migration state, Argus health/readiness,
   Tymra Worker readiness, alerts and rollback path;
3. begin with one bounded OTA source rather than enabling all six sources;
4. monitor failure rate, latency, CAPTCHA/manual-handoff frequency, evidence ACK/purge and queue
   recovery;
5. stop or roll back on identity drift, unpurged evidence, sustained readiness failure or an alert;
6. run a fresh two-day soak later if production-duration stability evidence is required.

## Status

```text
cycle_1_machine_result=PASSED
cycle_2_machine_result=NOT_RUN
automated_soak_gate=NOT_PASSED
release_decision=MANUAL_WAIVER_APPROVED
production_scheduler_authorized=false
```
