# Argus live OTA readiness — 2026-08-13

This record covers the Tymra development acceptance against the frozen Argus candidate. It is not a production availability guarantee.

## Cross-service result

- Check ID: `cmsq6289h0004o30pwsd88rmo`
- Input: public signed-out Agoda listing for Novotel Christchurch Airport
- Stay: 2026-08-14 to 2026-08-15, 2 adults, 1 unit, NZD
- Result: `PUBLISHED`, `isDemo=false`
- Observed price: NZD 309.00, `PARTIAL`, `NIGHTLY`, `PUBLIC_SIGNED_OUT`, fee completeness `PARTIAL`
- No stay total was presented by the member result contract; the observed price retained its `NIGHTLY` basis.
- The member result page passed a real browser assertion and contained no demo banner.

The live path now treats `PUBLIC_COLLECTION_MODE=live` as authoritative even when the general provider mode is `fixture`. Listing validation and rate collection cannot fall back to `Development Demo Data`. Agoda slug URLs are accepted only when the returned canonical URL resolves to the same provider/slug identity. Durable comparable discovery no longer recreates terminal source runs after a resumed Argus Job.

## Evidence and purge

| Workflow | Artifact | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `resolve_listing` | HTML | 1,200,456 | `c4c12f108c71cf9a3fd38e4252eeedbf75a807ce6a1bbec62385b7661ae72013` |
| `resolve_listing` | Screenshot | 3,564,167 | `a81e09a0fb7a1db6d1e239ed3be14311a172435f5a7cb63bcf5caaee75bfb475` |
| `collect_rates` | HTML | 1,418,961 | `91525404c257b91733d74679ab8da9a2fe492907141c78c1bb9c02e7fec8498a` |
| `collect_rates` | Screenshot | 3,734,508 | `86441535b226ca1fccd3f1467e00017ae3ae28a9c8269b81d8060b9667b0bb60` |

Evidence was hash-verified and retained in Tymra-owned storage before ACK. Both target Argus Jobs returned HTTP 410 after ACK; the asynchronous ACK path now verifies this purge response.

## Automated gates

- Lint and all workspace TypeScript checks passed.
- Root unit tests: 218 passed, 5 existing fixture-adapter tests skipped.
- Worker unit tests: 135 passed, 0 failed.
- Fresh isolated PostgreSQL/Redis integration environment: 105 passed, 0 failed, 0 skipped after migrations and standard seed.
- Web production build and Worker build passed. The optional `canvas` warning from `linkedom` remains non-blocking and the application does not import it for these workflows.
- Compose smoke completed healthy and removed its isolated containers, network and volumes.
- Controlled managed-challenge contract passed valid, invalid, missing, timeout and malformed-response cases.
- `pnpm accept:soak:ota` provides a resumable, frozen-release OTA soak gate. It verifies all six sources, both workflows, two passes, stable projections, evidence ACK/purge, release fingerprints, cross-cycle result drift, failure rate, at least 24 elapsed hours and at least two distinct New Zealand calendar days.

## Remaining external gates

- Managed-provider readiness was not run because deployment-owned provider configuration and explicit invalid-probe authorization are absent.
- The first result-page request after a long development run encountered a transient Next.js development compiler cache error; restarting the development web process cleared it and the same published check passed in 4.6 seconds. The optimized production build passed, but this remains a development-runtime observation.
- The final-candidate six-source acceptance completed soak cycle 1 with 24/24 successful and purged Jobs, stable projections for all 12 source/workflow pairs, a 0% failure rate and a 924,666 ms acceptance window. It started at `2026-08-12T17:38:54.889Z` (`2026-08-13` NZST). The checkpoint is intentionally not stable until cycle 2 starts after at least 24 elapsed hours and completes on another New Zealand calendar day; production-duration observation, capacity limits, alert routing and on-call ownership remain deployment gates.
- Frozen release identity for cycle 1: Argus image `sha256:09e2cd5d483ef384ca681eb560e7b6f999fd7e1b3d03e798b812a146029fb7ff`, Tymra image `sha256:b0f26efbd3bd94fa21aa1f5e90010b1b49011c3075077aadbd39bdbb68fdddd5`, release fingerprint `e93e2932ac15856d172a1e1a3edfc7394fac5a8683103ef13a29fec0c064b526`.

## Resume commands for deployment-owned gates

Keep the same frozen Argus and Tymra release metadata used by cycle 1, then run one additional cycle after at least 24 elapsed hours. The default checkpoint is `output/soak/ota-argus-checkpoint.json` and is intentionally ignored by Git:

```bash
ARGUS_COMMIT_SHA=6d9698d5c1bfe61a24fc92efc10afeba9437697d \
ARGUS_SOURCE_DIGEST=6a2a75bbb1a93ca12de9440786376f20b2bf95fd61906e950708ea8905ce8e20 \
ARGUS_IMAGE_ID=sha256:09e2cd5d483ef384ca681eb560e7b6f999fd7e1b3d03e798b812a146029fb7ff \
TYMRA_COMMIT_SHA=d310d02fa0125107423280a8eac90aa49e862813 \
TYMRA_SOURCE_DIGEST=a51a90db127710db5b47c70cba18bacae8dca64a3c3907c935ddf4d368a446c2 \
TYMRA_IMAGE_ID=sha256:b0f26efbd3bd94fa21aa1f5e90010b1b49011c3075077aadbd39bdbb68fdddd5 \
ARGUS_EVIDENCE_ROOT=<writable-host-evidence-directory> \
NODE_EXTRA_CA_CERTS=<host-mkcert-rootCA.pem> \
SOAK_CYCLES_PER_INVOCATION=1 \
pnpm accept:soak:ota
```

For the managed challenge gate, supply deployment-owned HTTPS provider configuration and explicitly authorize the invalid-token probe. Do not put these values in Git or shared logs:

```bash
ABUSE_CHALLENGE_MODE=managed \
ABUSE_CHALLENGE_VERIFY_URL=<provider-https-verify-url> \
ABUSE_CHALLENGE_SITE_KEY=<provider-site-key> \
ABUSE_CHALLENGE_SECRET=<provider-secret-at-least-32-characters> \
CHALLENGE_ACCEPTANCE_CONFIRM_INVALID_PROBE=YES \
pnpm test:challenge:readiness
```
