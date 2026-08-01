# Argus Connector data Schema acceptance — 2026-08-02

## Outcome

Passed in the local development environment with one bounded RBNZ B1 dry run. A real Argus Job
returned `rbnz-fx.collect_exchange_rates@1.0.0`; the current Tymra source accepted that exact
Connector/workflow contract and normalised two source records without persisting business signals.

## Scope

- Tymra CollectionRun: `cmsafmyfr0001uyicd1qrt0vo`
- Argus Job: `job_de14a2ac8a595c5808d26e92ec8382f8`
- Connector/workflow: `rbnz-fx / collect_exchange_rates`
- Mode: development-only `localAcceptance`, dry run, one request, maximum two records
- Scheduler: disabled

## Verified evidence

1. Argus health and readiness returned success with zero active tasks before the run.
2. The Argus Job completed successfully and its result contained the submitted `connector_id` and
   `workflow_id`, plus `data_schema = rbnz-fx.collect_exchange_rates` and
   `schema_version = 1.0.0`.
3. Tymra completed one request and one page with two records, two normalised market signals and zero
   failures.
4. The `CollectionRun` finished as `SUCCEEDED` with `successCount = 2` and `failureCount = 0`.
5. No `SourceMarketSignal` row referenced this CollectionRun, confirming that dry-run output was not
   persisted as business data.
6. The worker unit suite passed 38 tests and `tsc --noEmit` passed before the real-source run. The
   negative contract test also confirmed that another Connector's `data_schema` fails closed with an
   upstream HTTP 502 result before normalisation.

## Reproduction note

The host CLI requires the repository `.env` to be loaded explicitly and Node must trust the local
mkcert root CA before it connects to `https://api.argus.test`. The bounded command shape is:

```sh
NODE_EXTRA_CA_CERTS="<mkcert rootCA.pem>" node --env-file=.env \
  node_modules/tsx/dist/cli.mjs apps/worker/src/cli.ts collect:events \
  --source fx_rates --market new-zealand --limit 2 --local-acceptance --dry-run
```

This acceptance used the synchronous CLI compatibility path. It validates the live Connector data
contract boundary; durable Job resume and result ACK ordering remain covered by the separate
ARGUS-023 acceptance.
