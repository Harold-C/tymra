// Public market fields only: no customers, accounts, jobs, credentials or raw evidence.
// Keep this statement read-only; the same projection is used for local snapshots.
export const MARKET_READ_MODEL_SQL = `
SELECT json_build_object(
  'version', 1, 'asOf', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
  'rates', coalesce((SELECT json_agg(x) FROM (
    SELECT r.id, r."propertyId", r."listingId", r."sellableUnitId" AS "unitId",
      p.city, p.region, p."territorialAuthority" AS authority, p.latitude, p.longitude,
      p."accommodationType" AS category, r."effectiveNightlyTotalMinor" AS amount,
      r."observedAt", r."checkIn", r."checkOut", r.nights, r.adults, r.units,
      r."childrenAges", r."cancellationCategory", r."mealPlan", r."rateFence",
      r."availabilityStatus" AS availability, r."feeCompleteness" AS fees,
      r.currency, r."collectorVersion" AS collector, r."qualityFlags", r."supersededAt",
      r."sourceUrl", d.name AS source, r."paymentTerms",
      r."unitConstraints"->>'marketCollectionProfileKey' AS "profileKey"
    FROM "RateObservation" r JOIN "Property" p ON p.id=r."propertyId"
      JOIN "DataSource" d ON d.id=r."dataSourceId"
      JOIN "Listing" l ON l.id=r."listingId" JOIN "SellableUnit" u ON u.id=r."sellableUnitId"
    WHERE NOT r."isDemo" AND NOT p."isDemo" AND NOT l."isDemo" AND NOT u."isDemo" AND NOT d."isDemo"
      AND r."observedAt" >= now()-interval '180 days'
    ORDER BY r."observedAt" DESC LIMIT 20001
  ) x), '[]'::json),
  'events', coalesce((SELECT json_agg(x) FROM (
    SELECT o.id, e.title, e.category, v.name AS venue, v.city, v.region,
      v."territorialAuthority" AS authority, v.latitude, v.longitude,
      o."startsAt", o."endsAt", o.status, o."lastSeenAt" AS "observedAt",
      o."impactStatus", coalesce(s.sources,'[]'::json) AS sources
    FROM "EventOccurrence" o JOIN "CanonicalEvent" e ON e.id=o."canonicalEventId"
      LEFT JOIN "CanonicalVenue" v ON v.id=o."venueId"
      LEFT JOIN LATERAL (
        SELECT json_agg(DISTINCT jsonb_build_object('name',d.name,'url',se."sourceUrl")) AS sources
        FROM "EventOccurrenceSourceLink" sl JOIN "SourceEventOccurrence" se ON se.id=sl."sourceEventOccurrenceId"
        JOIN "DataSource" d ON d.id=se."dataSourceId"
        WHERE sl."eventOccurrenceId"=o.id AND NOT se."isDemo" AND NOT d."isDemo"
          AND sl."reviewStatus" IN ('AUTO_ACCEPTED','APPROVED','ACCEPTED')
      ) s ON true
    WHERE NOT o."isDemo" AND NOT e."isDemo" AND o."endsAt">=now()-interval '90 days'
      AND o."startsAt"<=now()+interval '180 days'
    ORDER BY o."startsAt",o.id LIMIT 20001
  ) x), '[]'::json),
  'signals', coalesce((SELECT json_agg(x) FROM (
    SELECT m.id,m.type,m.region,m."marketKey",m."startsAt",m."endsAt",m.status,
      coalesce(s.title,m.type::text) AS title,coalesce(s.observed,m."createdAt") AS "observedAt",
      coalesce(s.sources,'[]'::json) AS sources
    FROM "MarketSignal" m LEFT JOIN LATERAL (
      SELECT min(sm.title) AS title,max(sm."lastSeenAt") AS observed,
        json_agg(DISTINCT jsonb_build_object('name',d.name,'url',sm.metadata->>'sourceUrl')) AS sources
      FROM "MarketSignalSourceLink" sl JOIN "SourceMarketSignal" sm ON sm.id=sl."sourceMarketSignalId"
      JOIN "DataSource" d ON d.id=sm."dataSourceId"
      WHERE sl."marketSignalId"=m.id AND NOT sm."isDemo" AND NOT d."isDemo"
        AND sl."reviewStatus" IN ('AUTO_ACCEPTED','APPROVED','ACCEPTED')
    ) s ON true
    WHERE NOT m."isDemo" AND m."endsAt">=now()-interval '90 days' AND m."startsAt"<=now()+interval '180 days'
    ORDER BY m."startsAt",m.id LIMIT 20001
  ) x), '[]'::json)
) AS data`;
