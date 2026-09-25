-- Read-only production snapshot for the five approved first-batch schedules.
-- Run through psql with ON_ERROR_STOP=1; compare two snapshots from distinct UTC dates.
BEGIN TRANSACTION READ ONLY;

WITH approved(key, source_key) AS (
  VALUES
    ('first-public-holidays-weekly', 'public_holidays_nz'),
    ('first-mbie-adp-weekly', 'mbie'),
    ('first-christchurchnz-daily', 'rto_calendars'),
    ('first-geonet-daily', 'geonet'),
    ('first-stats-nz-weekly', 'stats_nz')
),
scheduled AS (
  SELECT a.key, a.source_key, s.id, s.enabled, s."cronExpression", s."lastEnqueuedAt", s."nextRunAt", s.payload
  FROM approved a LEFT JOIN "ScheduleDefinition" s ON s.key = a.key
),
latest_job AS (
  SELECT DISTINCT ON (s.key) s.key, j.id, j.status, j."attemptCount", j."createdAt", j."completedAt", j."lastErrorCode"
  FROM scheduled s LEFT JOIN "Job" j ON j."idempotencyKey" LIKE 'schedule:' || s.key || ':%'
  ORDER BY s.key, j."createdAt" DESC NULLS LAST
),
latest_run AS (
  SELECT DISTINCT ON (j.key) j.key, r.id, r.status, r."successCount", r."failureCount", r."finishedAt",
    r.scope -> 'counters' AS counters, r.scope -> 'christchurchScan' AS christchurch_scan
  FROM latest_job j LEFT JOIN "CollectionRun" r ON r."jobId" = j.id
  ORDER BY j.key, r."finishedAt" DESC NULLS LAST
),
latest_source_run AS (
  SELECT DISTINCT ON (s.key) s.key, r.id, r.status, r."finishedAt",
    r.scope -> 'counters' AS counters, r.scope -> 'christchurchScan' AS christchurch_scan
  FROM scheduled s LEFT JOIN "DataSource" d ON d.key = s.source_key
    LEFT JOIN "CollectionRun" r ON r."dataSourceId" = d.id AND r.status = 'SUCCEEDED' AND r."isDemo" = false
  ORDER BY s.key, r."finishedAt" DESC NULLS LAST
)
SELECT jsonb_pretty(jsonb_build_object(
  'capturedAtUtc', now(),
  'enabledScheduleCount', (SELECT count(*) FROM "ScheduleDefinition" WHERE enabled),
  'unapprovedEnabledSchedules', (SELECT coalesce(jsonb_agg(key ORDER BY key), '[]'::jsonb)
    FROM "ScheduleDefinition" WHERE enabled AND key NOT IN (SELECT key FROM approved)),
  'nonTerminalJobs', (SELECT count(*) FROM "Job" WHERE status IN ('PENDING', 'RUNNING')),
  'failedJobs', (SELECT count(*) FROM "Job" WHERE status IN ('FAILED', 'DEAD_LETTER')),
  'sources', (SELECT jsonb_agg(jsonb_build_object(
    'key', s.source_key,
    'schedulePresent', s.id IS NOT NULL,
    'scheduleEnabled', s.enabled,
    'cron', s."cronExpression",
    'schedulePayload', s.payload,
    'lastEnqueuedAt', s."lastEnqueuedAt",
    'nextRunAt', s."nextRunAt",
    'sourceEnabled', d.enabled,
    'sourceOperationalStatus', d."operationalStatus",
    'sourceHealthStatus', d."healthStatus",
    'sourceLastSuccessAt', d."lastSuccessAt",
    'latestJobId', j.id,
    'latestJobStatus', j.status,
    'latestJobAttempts', j."attemptCount",
    'latestJobCreatedAt', j."createdAt",
    'latestJobCompletedAt', j."completedAt",
    'latestJobErrorCode', j."lastErrorCode",
    'latestRunId', r.id,
    'latestRunStatus', r.status,
    'latestRunSuccessCount', r."successCount",
    'latestRunFailureCount', r."failureCount",
    'latestRunFinishedAt', r."finishedAt",
    'latestRunCounters', r.counters,
    'latestRunRetainedArtifacts', (SELECT count(*) FROM "RawArtifact" a WHERE a."collectionRunId" = r.id AND a."deletedAt" IS NULL),
    'latestRunParserFailures', (SELECT count(*) FROM "RawArtifact" a WHERE a."collectionRunId" = r.id AND a."parserFailure"),
    'latestRunSensitiveArtifacts', (SELECT count(*) FROM "RawArtifact" a WHERE a."collectionRunId" = r.id AND a."containsSensitiveData"),
    'latestSourceRunId', sr.id,
    'latestSourceRunStatus', sr.status,
    'latestSourceRunFinishedAt', sr."finishedAt",
    'latestSourceRunCounters', sr.counters,
    'christchurchScan', sr.christchurch_scan,
    'sourceEvents', (SELECT count(*) FROM "SourceEvent" e WHERE e."dataSourceId" = d.id),
    'sourceOccurrences', (SELECT count(*) FROM "SourceEventOccurrence" e WHERE e."dataSourceId" = d.id),
    'mergedOccurrenceKeyGroups', (SELECT count(*) FROM (
      SELECT e."canonicalKey" FROM "SourceEventOccurrence" e
      WHERE e."dataSourceId" = d.id GROUP BY e."canonicalKey" HAVING count(*) > 1
    ) merged),
    'unlinkedSourceOccurrences', (SELECT count(*) FROM "SourceEventOccurrence" e
      LEFT JOIN "EventOccurrenceSourceLink" l ON l."sourceEventOccurrenceId" = e.id
      WHERE e."dataSourceId" = d.id AND l.id IS NULL),
    'divergentCanonicalLinks', (SELECT count(*) FROM (
      SELECT e."canonicalKey" FROM "SourceEventOccurrence" e
      JOIN "EventOccurrenceSourceLink" l ON l."sourceEventOccurrenceId" = e.id
      WHERE e."dataSourceId" = d.id GROUP BY e."canonicalKey"
      HAVING count(DISTINCT l."eventOccurrenceId") > 1
    ) divergent),
    'sourceSignals', (SELECT count(*) FROM "SourceMarketSignal" m WHERE m."dataSourceId" = d.id)
  ) ORDER BY s.key) FROM scheduled s
    LEFT JOIN "DataSource" d ON d.key = s.source_key
    LEFT JOIN latest_job j ON j.key = s.key
    LEFT JOIN latest_run r ON r.key = s.key
    LEFT JOIN latest_source_run sr ON sr.key = s.key)
)) AS snapshot;

COMMIT;
