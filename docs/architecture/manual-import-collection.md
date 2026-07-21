# Manual rate import collection

**Development status:** Bounded local acceptance is implemented and automatically verified; real
operator-file acceptance is `not_verified`.

## Boundary

The normal Admin import remains a production-capable operator workflow. It requires an authenticated
administrator, same-origin request, operator rights attestation, an approved and enabled source, and
storage/analysis/display rights. It may update source health after an import.

Explicit `localAcceptance=true` is a separate development-only path. It still requires the operator
to attest that the uploaded data may be used, but it does not query `approvedBy` or `licenseBasis`,
does not require production approval/right flags and does not modify any source governance, rights,
operational or health field. It refuses `test` and `production`, refuses an enabled scheduler, and
requires the source to be enabled for `DEVELOPMENT`.

## Hard limits and coordination

- one uploaded CSV or JSON file;
- maximum file size 256 KB;
- at most two valid rows, regardless of how many the caller supplies;
- one concurrent import under the shared Redis `source:manual-import` lock;
- a 60-second lock lease/operation bound;
- no remote request, browser action or schedule creation.

The API returns `409 SOURCE_BUSY` when another manual import holds the source lock. Shared Redis
lock release/reacquisition and PostgreSQL job lease recovery are tested by the common acceptance
gates; manual import does not create a background job.

## Persistence and evidence

Each invocation creates an auditable `ManualImport` and `CollectionRun`. The run scope records the
requested byte/row counts, effective two-row bound, counters, governance snapshots and schedule
snapshots. Local acceptance creates one short-lived `RawArtifact` metadata record containing a file
hash and no file body. Clean imports use the 72-hour success class; row-validation failures use the
168-hour parser-failure class.

Rows resolve into source-owned `Listing` records linked by foreign keys to canonical `Property` and
`SellableUnit` records, then immutable `RateObservation` evidence. Those foreign keys are the
source-to-canonical lineage for accommodation observations; a separate fuzzy-match link is not
applicable. Stable observation identity is based on source, listing, stay query and collection time.
The second import does not update an immutable observation merely to point it at a later run: it
records the existing observation count in the second `CollectionRun` instead.

## Verification and blocker

The database integration regression verifies development/test/production and scheduler guards,
256 KB and two-record bounds, two-pass idempotency, one source listing and immutable observation per
stable identity, 72/168-hour evidence selection, unchanged governance and disabled schedules. It
uses generated test rows, not an operator export.

The remaining local acceptance blocker is a genuine operator CSV/JSON export that Harold is willing
to attest and use. Until the same bounded file is imported twice and its database rows are queried,
this channel remains `implemented_not_verified`, not `locally verified`.
