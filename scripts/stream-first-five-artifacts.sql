-- Streams retained parsed JSON only to the local hash verifier; never redirect this output to a file or log.
BEGIN TRANSACTION READ ONLY;

WITH approved(key) AS (
  VALUES ('first-public-holidays-weekly'), ('first-mbie-adp-weekly'),
    ('first-christchurchnz-daily'), ('first-geonet-daily'), ('first-stats-nz-weekly')
),
latest_job AS (
  SELECT DISTINCT ON (approved.key) approved.key, j.id
  FROM approved LEFT JOIN "Job" j ON j."idempotencyKey" LIKE 'schedule:' || approved.key || ':%'
  ORDER BY approved.key, j."createdAt" DESC NULLS LAST
),
latest_run AS (
  SELECT DISTINCT ON (j.key) j.key, r.id
  FROM latest_job j LEFT JOIN "CollectionRun" r ON r."jobId" = j.id
  ORDER BY j.key, r."finishedAt" DESC NULLS LAST
)
SELECT jsonb_build_object(
  'collectionRunId', a."collectionRunId",
  'artifactId', a.id,
  'contentHash', a."contentHash",
  'payload', a.payload
)::text
FROM latest_run r JOIN "RawArtifact" a ON a."collectionRunId" = r.id
WHERE a."deletedAt" IS NULL AND a.payload IS NOT NULL
ORDER BY a.id;

COMMIT;
