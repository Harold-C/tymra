-- Published result content is immutable. Only lifecycle transitions that preserve
-- every other column may supersede or withdraw a published version.
CREATE OR REPLACE FUNCTION tymra_protect_result_version()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ResultVersion history cannot be deleted';
  END IF;

  IF OLD.status = 'DRAFT'::"ResultVersionStatus" THEN
    RETURN NEW;
  END IF;

  IF OLD.status = 'PUBLISHED'::"ResultVersionStatus"
    AND NEW.status IN ('SUPERSEDED'::"ResultVersionStatus", 'WITHDRAWN'::"ResultVersionStatus")
    AND (to_jsonb(NEW) - 'status') = (to_jsonb(OLD) - 'status') THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Published ResultVersion records are immutable';
END;
$$ LANGUAGE plpgsql;
