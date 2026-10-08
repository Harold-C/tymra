CREATE TABLE "ServiceRuntimeHeartbeat" (
  "serviceId" TEXT PRIMARY KEY, "processId" TEXT NOT NULL, "environment" TEXT NOT NULL, "status" TEXT NOT NULL,
  "releaseVersion" TEXT NOT NULL, "sourceRevision" TEXT NOT NULL, "configurationHash" TEXT NOT NULL,
  "observedAt" TIMESTAMP(3) NOT NULL, "details" JSONB NOT NULL DEFAULT '{}'
);
CREATE FUNCTION tymra_guard_backfill_input() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Backfill evidence cannot be deleted'; END IF;
  IF TG_TABLE_NAME = 'ServiceBackfillRow' THEN
    IF NEW."payload" IS DISTINCT FROM OLD."payload" OR NEW."backfillId" IS DISTINCT FROM OLD."backfillId" OR NEW."rowNumber" IS DISTINCT FROM OLD."rowNumber" THEN RAISE EXCEPTION 'Backfill row input is immutable'; END IF;
  ELSE
    IF (to_jsonb(NEW) - ARRAY['status','savedRows','duplicateRows','failedRows','collectionRunId','jobId','completedAt']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','savedRows','duplicateRows','failedRows','collectionRunId','jobId','completedAt']) THEN RAISE EXCEPTION 'Backfill reviewed scope is immutable'; END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "service_backfill_scope_guard" BEFORE UPDATE OR DELETE ON "ServiceBackfill" FOR EACH ROW EXECUTE FUNCTION tymra_guard_backfill_input();
CREATE TRIGGER "service_backfill_row_guard" BEFORE UPDATE OR DELETE ON "ServiceBackfillRow" FOR EACH ROW EXECUTE FUNCTION tymra_guard_backfill_input();
