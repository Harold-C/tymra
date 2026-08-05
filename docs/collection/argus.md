# Argus browser collection boundary

Last updated: 2026-08-03

Argus provides Tymra's authenticated, read-only browser execution boundary. Tymra uses its asynchronous
Job API for Ticketmaster details, RBNZ B1, OurAuckland listing/details, and future Ticketek NZ;
stable JSON, CSV, RSS, GeoJSON and ordinary HTTP sources run directly in Tymra.

## Responsibility split

- Tymra owns scheduling, source governance, request budgets, locking, circuit state, persistence, canonicalisation and acceptance reporting.
- Argus owns Patchright navigation, challenge detection, source extraction and browser evidence.
- Tymra submits one read-only capture to `POST /v1/jobs`, persists the returned Job ID in
  `ArgusExecution`, parks the parent collection Job and releases its Worker lease.
- A database-backed `ARGUS_JOB_POLL` Job performs one status request per activation. While Argus is
  still running it moves itself back to `PENDING` with a later `runAt`; at a terminal state it saves
  the result and wakes the parent collection Job.
- The parent resumes the same `CollectionRun`. A stable trace ID prevents duplicate Argus submission,
  and evidence upserts prevent duplicate artifacts when earlier collection steps are replayed.
- After the parent has persisted its business records and completed the `CollectionRun`, Tymra downloads
  every referenced HTML/screenshot through Argus's authenticated evidence API. It verifies the response
  byte count, pointer SHA-256 and `X-Argus-Content-Sha256`, writes the file atomically to the Tymra evidence
  volume, and changes the artifact reference to `tymra-evidence:`. Only then does it submit the exact
  `result_sha256` to `POST /v1/jobs/{jobId}/ack`. A copy, integrity or database update failure prevents ACK.
- `ticketmaster-public` supports selectively required detail capture; listings are direct HTTP in Tymra.
- Eventfinda listing and detail collection are direct HTTP in Tymra; its legacy connector is outside the current responsibility boundary.
- `rbnz-fx` supports the fixed RBNZ B1 exchange-rate page.
- For successful and partial results, Tymra selects the source normalizer only when `data_schema` and
  `schema_version` exactly match the submitted Connector/workflow. Unknown versions, missing markers
  and another Connector's payload fail closed as an upstream contract error before business data is
  persisted.
- Argus is required in development and production. Tymra has no in-process or private Browser Worker
  fallback.

## Local configuration

Set these values in Tymra's untracked `.env`:

```text
ARGUS_API_BASE_URL=https://api.argus.test
ARGUS_API_TOKEN=<the same independent random token configured in Argus>
ARGUS_TIMEOUT_MS=60000
ARGUS_JOB_POLL_TIMEOUT_MS=180000
ARGUS_EVIDENCE_ROOT=./data/argus-evidence
MKCERT_ROOT_CA_PATH=<the rootCA.pem below `mkcert -CAROOT`>
```

The token must contain at least 32 characters and include the Argus Job and `evidence:read` scopes.
Do not reuse `CRON_SECRET` or another application secret.
`ARGUS_TIMEOUT_MS` is the deadline for one browser capture. `ARGUS_JOB_POLL_TIMEOUT_MS` separately
covers queueing plus execution and must be greater than the capture deadline.

## Durable execution state

`ArgusExecution` is the local source of truth for the Tymra-to-Argus handoff:

- `orchestrationKey` is unique per parent Job and capture target.
- `argusJobId`, connector, workflow, URL, deadline and the terminal result survive Worker restarts.
- Deferred polling does not consume the parent or poller's retry budget; `attemptCount` reflects real
  attempts rather than status checks.
- Cancelling the parked parent causes the poller to call `DELETE /v1/jobs/{jobId}`. The local parent
  remains authoritative even if that best-effort network request fails.
- A polling deadline marks the execution failed with `TIMEOUT`, requests remote cancellation and
  wakes the parent so normal source failure handling can finish the `CollectionRun`.

Direct CLI calls without a database Job retain the synchronous compatibility path. Scheduled and
manually queued Eventfinda, Ticketmaster and RBNZ collections use the durable path.

The accepted Argus data contracts are currently:

| Connector/workflow | `data_schema` | `schema_version` |
| --- | --- | --- |
| `ticketmaster-public / collect_listing` | `ticketmaster-public.collect_listing` | `1.0.0` |
| `ticketmaster-public / collect_detail` | `ticketmaster-public.collect_detail` | `1.0.0` |
| `eventfinda-public / collect_listing` | `eventfinda-public.collect_listing` | `1.0.0` |
| `eventfinda-public / collect_detail` | `eventfinda-public.collect_detail` | `1.0.0` |
| `ourauckland-public / collect_listing` | `ourauckland-public.collect_listing` | `1.0.0` |
| `ourauckland-public / collect_detail` | `ourauckland-public.collect_detail` | `1.0.0` |
| `rbnz-fx / collect_exchange_rates` | `rbnz-fx.collect_exchange_rates` | `1.0.0` |

The Worker reaches the same HTTPS API origin used by cross-network clients. Docker maps `api.argus.test`
to the host gateway, and Node trusts only the mounted mkcert development root CA. Do not disable TLS
verification.

Argus is a cross-application service rather than a Tymra-owned component. Its development origins mirror
the planned production `argus.nz` structure:

- API: `https://api.argus.test`
- human handoff: `https://connect.argus.test`
- service diagnostics: `https://argus.test/health` and `/readiness`

Tymra does not construct handoff URLs or depend on noVNC paths. Argus must return any complete,
short-lived handoff URL through its handoff contract.

## Acceptance

Use the existing bounded local acceptance commands with the scheduler disabled:

```sh
docker compose exec -T worker ./node_modules/.bin/tsx src/cli.ts \
  collect:events --source ticketmaster --market new-zealand \
  --phase discovery --max-pages 1 --limit 2 --local-acceptance

docker compose exec -T worker ./node_modules/.bin/tsx src/cli.ts \
  collect:events --source eventfinda --market new-zealand \
  --phase discovery --max-pages 1 --limit 2 --local-acceptance --dry-run

docker compose exec -T worker ./node_modules/.bin/tsx src/cli.ts \
  collect:events --source fx_rates --market new-zealand \
  --limit 2 --local-acceptance --dry-run
```

Ticketmaster may be run twice to verify identity reuse and detail-request avoidance. Any challenge
response must stop through Tymra's existing circuit/cooldown path without bypass attempts.

The 2026-07-29 RBNZ acceptance Job `job_3124f28748192ecf86e43f8ae7e6fd8a`
completed in approximately 11.5 seconds with seven series, two evidence artifacts and no challenge.

The durable orchestration acceptance on 2026-07-29 used Tymra Job
`cms5wjbfz0000o42hpdgge5kz` and Argus Job `job_0514d3af653313918f6338daf5eb3bbd`.
The parent was parked while the poller ran at approximately one-second intervals, then resumed with
`attemptCount=1`; one `CollectionRun` completed with two bounded local-acceptance signals.
Restart recovery was separately verified with Tymra Job `cms5wk5wy0000o44ablps29nb`: the Worker was
restarted while Argus was running, after which the same one execution and one collection run resumed
and completed successfully.

The 2026-07-30 resume-boundary acceptance verified the fixes for queued dry runs, bounded detail
batches and cancellation settlement:

- Dry-run Job `cms635pas0000qw88e4763e75` completed with one Argus listing execution, 20 discoveries,
  zero persisted targets/events and zero `RawArtifact` rows.
- Historical pre-cutover Eventfinda Job `cms636ii30000qwcr2en9lh12` completed with exactly three Argus executions:
  one listing and the two detail URLs persisted in `CollectionRun.scope.argusProgress`. Repeated parent
  resumes did not select another detail batch; the final scope reported `requests=3` and
  `detailsFetched=2`.
- Cancellation Job `cms63d8so0000sv2hoevj3xhx` deliberately raced a completed Argus listing. The
  parent remained `CANCELLED`, its only `CollectionRun` settled automatically as
  `CANCELLED / JOB_CANCELLED`, and no detail execution was submitted.

The 2026-08-01 ARGUS-023 acceptance verified that Tymra persists a bounded RBNZ result before sending
the hash ACK, Argus purges the result and evidence, repeated ACK remains idempotent, and Tymra's two
business signals remain available. See
[`argus-023-acceptance-2026-08-01.md`](../evidence/argus-023-acceptance-2026-08-01.md).

The 2026-08-02 Connector data Schema acceptance submitted one bounded RBNZ Job through the current
Tymra source. Argus returned `rbnz-fx.collect_exchange_rates@1.0.0`; Tymra accepted and normalised two
records with zero failures, while dry-run persistence remained empty. See
[`argus-connector-schema-acceptance-2026-08-02.md`](../evidence/argus-connector-schema-acceptance-2026-08-02.md).

The 2026-08-02 ARGUS-025～030 acceptance used one real OurAuckland listing and two detail Jobs. Both
detail payloads passed `ourauckland-public.collect_detail@1.0.0`, Tymra normalised two events with no
failures, and dry-run persistence remained empty. See
[`argus-025-030-acceptance-2026-08-02.md`](../evidence/argus-025-030-acceptance-2026-08-02.md).

## Current local runtime snapshot

On 2026-08-01 both `https://argus.test/health` and `/readiness` returned HTTP 200 with no active task.
The Tymra development database had the `20260729093000_argus_execution_orchestration` migration
applied, 33 completed Argus executions, one cancelled execution and no active Argus execution.
Scheduler remained disabled with zero enabled schedule definitions.

This is a point-in-time health and persistence check. The Tymra application containers were rebuilt
during the final review; the running Argus client, Worker service and acceptance runner hashes then
matched the worktree and Worker health/readiness returned HTTP 200. Fresh database integration and
real-source acceptance were still not rerun, so this is not production readiness evidence.
