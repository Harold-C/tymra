# Lincoln University key dates acceptance — 2026-08-04

## Result

Passed in the local development environment using two real, bounded collection Jobs against the Argus `lincoln-university-key-dates/collect_key_dates` connector. Schedules remained disabled.

## Verified evidence

1. Both parent Jobs and both `CollectionRun` rows finished `SUCCEEDED` on their first attempt.
2. Each pass created exactly one durable Argus execution and completed the `lincoln-university-key-dates.collect_key_dates@1.0.0` contract.
3. Each pass normalised two Lincoln records and recorded two unchanged skips. Both passes added zero source or lineage rows; the database retained three Lincoln signals with matching canonical links from the preceding parser verification runs.
4. Each pass retained four raw artifacts with zero parser failures: one local HTML file, one local screenshot and two structured network-response rows. No `argus-evidence:` reference remained.
5. Argus evidence downloads were size- and SHA-256-verified before their storage references changed to `tymra-evidence:` and the exact result hash was ACKed. Both remote result endpoints subsequently returned HTTP 410.
6. The enabled schedule count was zero before and after the run, and no Argus execution remained active.

The bounded acceptance window was `2026-08-01T00:00:00.000Z` through `2026-09-01T00:00:00.000Z`, with a two-record limit. Administrative and unresolved source rows were not promoted to standard market signals.

A preliminary diagnostic run exposed that the generic public-source catch path marked a deferred collection run as failed. The resumed parent then created a different run, so copy-before-ACK could not find the later evidence rows. The final implementation preserves `RUNNING` for `DeferredJobError`, resumes the original run, and includes explicit acceptance failures for missing local evidence or remaining remote references. Only the final rerun above is the passing evidence.
