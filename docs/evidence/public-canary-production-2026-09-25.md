# First public-source production canary, 2026-09-25

Status: **accepted for three bounded, manually triggered public-source canaries**. This does not authorize or validate scheduled collection, the customer surface, OTA accounts, RBNZ, or other sources.

## Release and recovery

- Code commit: `6d948dda4e76cb87416661e2ce4b4863341be52b` on `release/tymra-public-canary-20260925`. The exact source archive at `/srv/apps/tymra/releases/public-canary-20260925-v2/source.tar.gz` has SHA-256 `036594f90bb4e9a2faa01334f738747080c8fbbd823510413735f9a9441a50b2`.
- Native amd64 image `tymra:public-canary-20260925-v2` has image ID `sha256:1f9234adb27d8e01792f6aefe6fd0c98cf9a38031fbeb5bd15ac1fb45becda77`. The release Compose SHA-256 is `5b88550d21a47f9cebe87d219481039b521244c5fb3ef802fe2b8f20c7dccd0e`. Only the production Worker and API were recreated with the new image. The Admin-only Web remains healthy on `sha256:ed9e56e89aab5ed82211660d893aae424d2a5e9e41d5e3f9dae2056bed7b9417`. The previous healthy Worker/API image `tymra:argus-prod-20260924-v3` (`sha256:623a91d4f1d5c22b3506532d547e1fd1be0c4969cfde3b89ed0902a2e5a39bfc`) and Compose release remain available.
- Before mutation, `/srv/apps/tymra/backups/public-canary-20260925/` captured `production.env`, the previous Compose file, a PostgreSQL custom-format dump, and the evidence volume. All four checksums passed. The dump listed 672 archive entries. The production environment file remained `0600 root:root`; no variable was edited.
- After acceptance, `/srv/apps/tymra/backups/public-canary-20260925/post-acceptance/` captured a fresh PostgreSQL dump (SHA-256 `5e255964240f5b916c7bfc0b07ed7d47c7ba551559d6b8539ebb46c34b4b1390`) and evidence volume archive (SHA-256 `7c3d69d67694cc703deaeb0f2ea55a3d1602b07218ec8181bfed2dc85411310a`). Checksums and archive listings passed; a separate scratch-database restore was not run. Both backup directories are root-owned, mode `0700`, with backup files mode `0600`.
- No migration or seed ran; the production database retained 33 successful migrations and zero failed migrations. Only three exact non-demo source records were created from the formal source registry. No schedules were created.

For a collection-runtime rollback, first stop new collection using `node dist/cli.js release:rollback --confirm DISABLE_COLLECTIONS` in the Worker container and suspend the three canary sources if needed. Then recreate only Worker/API from `/srv/apps/tymra/releases/argus-prod-20260924-v3/compose.yml` with `docker compose -p tymra --env-file /srv/apps/tymra/shared/production.env -f compose.yml --profile collection up -d --no-deps worker api`. Preserve the accepted database and evidence volume. Restoring the pre-canary database would discard accepted business records and needs a separate assessment. This rollback path is prepared but was not executed.

## Bounded production acceptance

The production Worker/API reached `https://api.argus.nz`: Argus health and readiness were both healthy. These three official public HTTP adapters do not submit Argus Jobs or use its evidence/ACK lifecycle; Argus authentication and ACK/PURGED were previously accepted only for Lincoln and were not repeated here. The official-source canaries were invoked through Tymra's production `release:canary-run` CLI, which calls the real Worker collection service and persists production `CollectionRun`, `RawArtifact`, business rows, and source links. No queue Job was created by this manual canary command.

Each source passed a production preflight with zero enabled schedules, a healthy source, and exactly two bounded passes. The collector capped network references to one for Employment NZ and MBIE, and three paginated requests for ChristchurchNZ; it capped raw records and total normalized business results at two per pass, used a 31-day maximum window, and timed out at 30 seconds. The same fixed date window was used on both passes. No generic/demo seed, Scheduler, Booking, Airbnb, or Synix account was used.

| Source and range (NZ dates) | Pass 1 run | Pass 2 run | Final business rows | Repeat growth |
| --- | --- | --- | --- | --- |
| `public_holidays_nz`, 26 Sep–26 Oct 2026 | `cmug15k180001mr49rfd1jzlv` (1) | `cmug15lik0007mr494niegmkw` (1) | 1 market signal, 1 source link | 0 |
| `rto_calendars`, 25 Sep–25 Oct 2026 | `cmug16i5g0001mr8ivp5yfaq9` (2) | `cmug16jyz000rmr8itkbs6b0w` (2) | 2 source events, 2 occurrences, 2 links of each kind | 0 |
| `mbie`, 25 Sep–25 Oct 2026 | `cmug17hq80001mrcrmqd0j476` (2) | `cmug17lyd000bmrcrw48v79r4` (2) | 2 market signals, 2 source links | 0 |

All six runs ended `SUCCEEDED` with zero failure count, zero parser failures, unchanged source configuration and schedules, and no remote Argus evidence references. The 12 persisted `RawArtifact` payloads matched their stored SHA-256 hashes when recalculated from canonical JSON; these hashes cover parsed payloads, not independently retained upstream response bytes. Source-side HTML/JSON/CSV raw response byte identity was therefore not asserted. The final production database check found no failed canary run, no enabled schedule, and no pending or running Job.

## Final operating boundary

Worker and API run the exact new image; API readiness/health returned HTTP 200 with PostgreSQL, Redis, and Argus healthy, queue depth and failed count zero, and no alerts. The Worker still mounts `tymra_argus_evidence` read/write. Web remains healthy on the original Admin-only image. The rendered Compose configuration had no Scheduler service, and no Scheduler container exists. `SCHEDULER_ENABLED`, `HIGH_FREQUENCY_SCHEDULER_ENABLED`, `ACCEPT_NEW_CHECKS`, `INTERNAL_ON_DEMAND_ENABLED`, `CUSTOMER_FUNNEL_ENABLED`, and `BILLING_ENABLED` remained false; `ADMIN_ONLY_ACCESS` remained true. The three sources are enabled for explicit manual use but have no automatic schedule. Long-running collection, source freshness, RBNZ, the remaining connectors, customer flows, Stripe, SMTP, and membership remain unaccepted by this canary.
