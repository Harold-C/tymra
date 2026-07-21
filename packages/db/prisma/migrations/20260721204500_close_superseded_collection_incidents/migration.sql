WITH ranked_incidents AS (
  SELECT
    incident.id,
    first_value(incident.id) OVER (
      PARTITION BY run."dataSourceId", incident.category
      ORDER BY run."createdAt" DESC, incident."createdAt" DESC
    ) AS latest_incident_id,
    row_number() OVER (
      PARTITION BY run."dataSourceId", incident.category
      ORDER BY run."createdAt" DESC, incident."createdAt" DESC
    ) AS recency_rank
  FROM "CollectionIncident" incident
  JOIN "CollectionRun" run ON run.id = incident."collectionRunId"
  WHERE incident.status IN ('OPEN', 'IN_PROGRESS')
)
UPDATE "CollectionIncident" incident
SET
  status = 'RESOLVED',
  "resolutionAction" = 'SUPERSEDED_BY_LATER_RUN',
  "resolutionReason" = 'Superseded by collection incident ' || ranked.latest_incident_id,
  "resolvedAt" = now(),
  "updatedAt" = now()
FROM ranked_incidents ranked
WHERE incident.id = ranked.id
  AND ranked.recency_rank > 1;
