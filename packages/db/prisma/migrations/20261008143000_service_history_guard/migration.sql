CREATE TRIGGER "public_fact_version_append_only"
BEFORE UPDATE OR DELETE ON "PublicFactVersion"
FOR EACH ROW EXECUTE FUNCTION tymra_reject_all_mutation();
