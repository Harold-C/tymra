# ARGUS-023 result acknowledgement acceptance — 2026-08-01

## Outcome

Passed in the local development environment with one bounded RBNZ B1 collection. Tymra persisted the
business result before acknowledging the exact Argus result hash. Argus then purged its result and
evidence, while the Tymra records remained available.

## Scope

- Tymra parent Job: `cms9rgegl0000ld6tkx2boa87`
- Tymra CollectionRun: `cms9rgen30001ld0nj0lzbced`
- Argus Job: `job_a6b903ce3ae313840010b1f0ff33516d`
- Source: `fx_rates`
- Mode: development-only `localAcceptance`, one request, maximum two records
- Raw HTML and screenshot files were intentionally not retained by Tymra. Tymra retained their
  metadata and hashes only.

An initial ordinary Job was rejected by the source gate that existed at the time. That gate has
since been removed. The bounded acceptance Job used the development path and changed no source configuration.

## Verified sequence

1. Argus execution completed at `2026-08-01T02:37:59.088Z` and Tymra stored a valid 64-character
   `result_sha256` in `ArgusExecution.result`.
2. Tymra completed its `CollectionRun` at `2026-08-01T02:37:59.279Z` with two source market signals,
   two canonical links, two evidence metadata records, zero failures and valid content hashes.
3. Tymra submitted the ACK at `2026-08-01T02:37:59.324Z`, after the business transaction completed.
4. Argus completed the purge at `2026-08-01T02:37:59.354Z` with
   `delivery.status = PURGED` and `purge_reason = ACKNOWLEDGED`.
5. `GET /v1/jobs/{jobId}/result` returned `410 RESULT_PURGED` before and after a repeated ACK.
6. Repeating the same hash ACK returned success, confirming idempotency.
7. The Argus repository retained only its audit record: the request, item result and lineage source URL
   were null, and the trace evidence directory no longer existed.
8. After the repeated ACK, Tymra still held both RBNZ source signals and both canonical links.

## Residual boundary

The two Tymra `RawArtifact` rows retain `argus-evidence` references and SHA-256 metadata, but the
referenced HTML and screenshot files are deliberately removed by ACK. If Tymra later requires raw
evidence retrieval rather than metadata and hashes, it must copy those files to Tymra-owned storage
before acknowledging the result.
