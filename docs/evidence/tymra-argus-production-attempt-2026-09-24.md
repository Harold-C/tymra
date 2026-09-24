# Tymra → Argus production acceptance attempt, 2026-09-24

Status: **stopped and rolled back**. This is an execution record, not a production acceptance.

## Scope and release identity

- Target: `spm-prod-01` (`148.135.121.30`), release directory `/srv/apps/tymra/releases/argus-prod-20260924-v2/`.
- Pre-existing Admin-only image: `sha256:ed9e56e89aab5ed82211660d893aae424d2a5e9e41d5e3f9dae2056bed7b9417`.
- Second candidate image: `sha256:57a7b613f52b9ebbc23c4d0f6bb7b50e42d2acbe0bbe19376e99e92f6b583bda` (`tymra:argus-prod-20260924-v2`), built natively for amd64. Candidate source archive SHA-256: `bdbc065915c819f3198d603ad9255453e767237e1852704a4fb6f716df05fb32`; build log SHA-256: `cacbe3058ae7ed69ba4782ce7ebb3b44d9bde69b20c00ad260bf9376c656f3ae`.
- The candidate was assembled from the exact prior production source archive (`fb9c1de9a6f2847f995805b7a078f14c43a724c7769ff27bc8282f8cad84aecc`) plus ten task-related build/Worker files. The prior archive itself came from an uncommitted source snapshot, so a Git commit alone does not reproduce either production image. No broad worktree snapshot was committed.
- The first candidate, `sha256:0630b3cc9bf3fc1ab693612102b14956cf38e13ecb8173526de733c00058e82a`, failed its Worker/API startup check because its bundle could not resolve workspace source modules. It was rolled back before any source or Argus Job was created. The second candidate used a corrected Worker bundle and passed container startup checks.

## Preconditions, backups, and runtime checks

- Before the attempt: PostgreSQL, Redis and Web only; 32 successful migrations, no failed migrations, no DataSource, Job, ScheduleDefinition or ArgusExecution rows. Production environment file mode/owner: `0600 root:root`.
- Protected recovery directory: `/srv/apps/tymra/backups/argus-prod-20260924/` (`0700 root:root`). Pre-attempt environment SHA-256: `4ea8e7506adb80b95eceff63451d644972e0767fe43fd2c42b1ec179308d1b82`; pre-attempt database dump SHA-256: `4809d4cce80fe3a15915cb302744a3f65d56df9844421bc6e3b68cd1a3404853`. PostgreSQL successfully listed the dump contents. Post-failure database dump SHA-256: `1ac2be1dbe18b8e69ffb0ca6e9719ae3f5176bdd9041dca50c432f1a82c11a92`, also listed successfully.
- The Argus handoff file remained unchanged on `ml-mini`. Only `PROD_ARGUS_API_BASE_URL` and `PROD_ARGUS_API_TOKEN` were replaced in the protected production environment. A byte comparison confirmed all other configuration lines unchanged and mode/owner preserved. The original environment was restored after failure; its SHA-256 again matched the pre-attempt copy. No credential value was printed or committed.
- Production Compose with the `collection` profile rendered Web, Worker and API to the same second-candidate image; Scheduler was absent. Scheduler/high-frequency Scheduler, new Check intake, internal on-demand, customer funnel and billing switches remained off. No migration or seed ran.
- Web and API health checks passed. In the actual Worker/API containers, Node DNS/TLS checks to Argus health/readiness returned 200/200; a scoped read of a nonexistent Job returned 404 and a forbidden runtime-list read returned 403. Worker API readiness returned 200 with database, Redis and Argus healthy and Scheduler disabled.
- Worker mounted the `tymra_argus_evidence` volume read/write at `/argus-evidence`. A temporary probe had the same SHA-256 after a forced Worker recreation; the probe was then removed.

Local lint, workspace type checks and Worker unit tests passed; the Worker unit suite reported 142 passing tests. The broader integration suite did not pass (9 of 110 failed, including local database/Redis test-environment failures and an external redirect), so it cannot support a release claim. The post-failure schema/mapping fix passed fresh workspace type checks and Worker unit tests but has not been built or tested in production.

## Bounded acceptance and failure

- Created one non-demo production `christchurch_university_dates` source with `COLLECT_PUBLIC_SIGNALS` and `HEALTH_CHECK`, marked for Lincoln-only acceptance and with no schedule. Production preflight passed.
- Enqueued exactly one `PUBLIC_DATA_COLLECTION` parent Job `cmuewbfvv0000pd4er93ffgny`, constrained to Lincoln University, 2026, Christchurch, and at most two normalised records. The Argus execution was `job_767304e12cb4d49628e675a0749ff64a`, connector `lincoln-university-key-dates`. Argus completed and returned 105 extracted key dates and two evidence pointers.
- Tymra CollectionRun `cmuewbgjd0001s008v8q23qov` failed with `PARSING_ERROR`: `UNIVERSITY_CALENDAR` is emitted by the Lincoln normaliser but was absent from Tymra's persisted `MarketSignalType` enum and `mapSignalType`. The parent Job failed on its first attempt. No `SourceMarketSignal` was written; there was no second Argus execution or duplicate business record.
- Evidence retention then failed its integrity gate. The screenshot body matched Argus's declared size and SHA-256. The HTML body fetched through the production API was **1,385,165 bytes**, versus the declared **1,384,924 bytes**, and its SHA-256 differed. The response's `x-argus-content-sha256` header still matched Argus metadata. Requesting `Accept-Encoding: identity` did not remove the 241-byte difference. This proves a delivered-byte mismatch, but does not yet establish where the bytes changed. Tymra correctly refused to treat the HTML evidence as verified.
- The production database retained four RawArtifact rows, including two `argus-evidence:` references and zero `tymra-evidence:` references. Argus ACK was **not** sent. A read-only post-failure `GET` of the Argus result returned **200**, not 410; remote result/evidence purge was not achieved.

## Stop state and next gate

Worker/API were stopped and removed, original Web image and environment restored, and the sole acceptance source suspended (`enabled=false`, lifecycle `SUSPENDED`). Web, PostgreSQL and Redis remained healthy; Scheduler stayed off. The failed Job, ArgusExecution, source row and protected post-failure dump remain for diagnosis. Do not restore the pre-attempt dump over these audit records.

The repository contains a local-only Tymra fix adding `UNIVERSITY_CALENDAR` to the schema and a migration. The Worker now validates signal types against the generated Prisma enum rather than a second handwritten list. Worker unit tests passed 144/144, workspace type checks passed, and the migration accepted an enum insert in a disposable PostgreSQL database cloned from the local schema. **The migration was not applied in production and no new image containing this fix was deployed.**

## Evidence-delivery diagnosis (read-only, 2026-09-24)

- Argus's protected `page.html` on `ml-mini` is 1,384,924 bytes with SHA-256 `770e131392401c3d2fd76bbaae6a6143306e67792365170fdcdc2ad20057dd12`. The Argus evidence manifest declares exactly that size and hash.
- The authenticated Argus API on the application container's loopback returned HTTP 200 with the identical bytes, size and hash. The authenticated `https://api.argus.nz` route returned HTTP 200 with 1,385,165 bytes and SHA-256 `aa3fba405441f453c1a5d0406507365a2c444225dc64c40cbc1e841794573903`; its `x-argus-content-sha256` header still declared the original hash. `Accept-Encoding: identity` was used for both requests.
- Only the public response contained Cloudflare's `data-cfemail` marker and `email-decode.min.js` reference. Its single obfuscated address decoded to an address present in the origin file; the public response identified `server: cloudflare`. This isolates the integrity failure to Cloudflare Email Address Obfuscation on the public delivery path, after Argus generated and served the evidence. No source site was visited and no ACK was sent during diagnosis.
- Cloudflare documents that Email Address Obfuscation rewrites visible addresses in HTML and injects the decoder script. It also documents that a `Cache-Control: no-transform` response prevents this transformation: <https://developers.cloudflare.com/waf/tools/scrape-shield/email-address-obfuscation/>. A narrowly scoped origin response-header fix or Cloudflare rule should be reviewed and verified with the same authenticated evidence route before production collection resumes. Preserve the byte/hash check; do not accept the transformed body as original evidence.

The remaining gates are a verified delivery fix, an exact-image Tymra release with the type migration, and a deliberate recovery plan for the already-completed Argus Job without another source-site capture. Do not retry the Lincoln source automatically. RBNZ was not used as a gate; its reported production `PARSING_ERROR` was not retested here. Other connectors were not accepted by this attempt.
