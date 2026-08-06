ALTER TABLE "Listing"
ADD COLUMN "providerBrand" TEXT,
ADD COLUMN "providerFamily" TEXT;

CREATE INDEX "Listing_propertyId_providerFamily_listingStatus_idx"
ON "Listing"("propertyId", "providerFamily", "listingStatus");

UPDATE "Listing" AS listing
SET
  "providerBrand" = CASE source."key"
    WHEN 'booking' THEN 'BOOKING'
    WHEN 'airbnb' THEN 'AIRBNB'
    WHEN 'expedia' THEN 'EXPEDIA'
    WHEN 'wotif' THEN 'WOTIF'
    WHEN 'hotels' THEN 'HOTELS_COM'
    WHEN 'bookabach' THEN 'BOOKABACH'
    WHEN 'vrbo' THEN 'VRBO'
    WHEN 'agoda' THEN 'AGODA'
    WHEN 'trip' THEN 'TRIP_COM'
    ELSE NULL
  END,
  "providerFamily" = CASE source."key"
    WHEN 'booking' THEN 'BOOKING_HOLDINGS'
    WHEN 'agoda' THEN 'BOOKING_HOLDINGS'
    WHEN 'airbnb' THEN 'AIRBNB'
    WHEN 'expedia' THEN 'EXPEDIA_GROUP'
    WHEN 'wotif' THEN 'EXPEDIA_GROUP'
    WHEN 'hotels' THEN 'EXPEDIA_GROUP'
    WHEN 'bookabach' THEN 'VRBO_GROUP'
    WHEN 'vrbo' THEN 'VRBO_GROUP'
    WHEN 'trip' THEN 'TRIP_COM'
    ELSE NULL
  END
FROM "DataSource" AS source
WHERE listing."dataSourceId" = source."id"
  AND source."sourceType" = 'OTA';
