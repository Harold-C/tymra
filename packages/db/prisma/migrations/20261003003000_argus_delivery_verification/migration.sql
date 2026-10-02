-- Delivery is verified after result retention and ACK/purge. Keep this lifecycle
-- fact on the execution, without mutating immutable completed collection runs.
ALTER TABLE "ArgusExecution" ADD COLUMN "deliveryVerifiedAt" TIMESTAMP(3);
