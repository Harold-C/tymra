# ARGUS-025～030 Connector acceptance — 2026-08-02

## Outcome

Passed with one bounded, real OurAuckland listing-to-detail dry run against the rebuilt Argus
development service. Tymra consumed the new Connector-specific data contracts and normalised two
events without persisting business rows.

## Scope

- Tymra CollectionRun: `cmsaggkac0001uyjury4wygy6`
- Argus listing Job: `job_9dc1d745c02309d1d67518db7ab79e73`
- Argus detail Jobs: `job_75458a8cd75a37e5f5f4cb87067d5121`,
  `job_89193cc115fc881bf10c4b0267a3f3cb`
- Mode: development-only local acceptance, dry run, one listing and maximum two details
- Scheduler: disabled

## Verified evidence

1. Listing returned `ourauckland-public.collect_listing@1.0.0`, complete quality and an explicit
   result-limit warning.
2. Both details returned `ourauckland-public.collect_detail@1.0.0`, complete quality, no missing
   fields and no warnings.
3. Both details contained a DATETIME occurrence, `Pacific/Auckland`, venue and address text, map URL,
   free/cost facts, categories, tags and ward.
4. Tymra made three requests and produced two events with zero failures.
5. The CollectionRun finished `SUCCEEDED` with `successCount = 2`; no `SourceEventOccurrence` row
   referenced the dry-run CollectionRun.
6. Before the real run, Argus image build tests passed 64 tests with zero failures and three
   PostgreSQL tests skipped because no isolated test database was configured. Tymra worker passed
   39 tests, providers passed 24 tests, and both relevant package type checks passed.

## Boundary

This acceptance proves the live OurAuckland Connector and Tymra normalizer. Ticketmaster and
Eventfinda field expansions are covered by deterministic fixtures because Ticketmaster access can be
temporarily challenged and repeated live requests are intentionally avoided.
