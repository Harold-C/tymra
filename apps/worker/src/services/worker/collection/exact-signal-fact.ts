import type { Prisma } from "@tymra/db";
import { stableHash, stableId } from "../helpers";

// Prisma's JSON input encoding can round a binary64 value before PostgreSQL sees it.
// Bind the original JSON text so the stored payload and its digest describe identical bytes.
export async function insertExactSignalFact(tx: Prisma.TransactionClient, input: {
  idempotencyKey: string; dataSourceId: string; collectionRunId: string; externalId: string;
  contentHash: string; observedAt: Date; startsAt: Date; endsAt: Date;
  payload: Prisma.InputJsonValue; isDemo: boolean;
}) {
  if (stableHash(input.payload) !== input.contentHash) throw Error("SIGNAL_FACT_INPUT_HASH_MISMATCH");
  await tx.$executeRaw`INSERT INTO "PublicFactVersion"
    (id,"idempotencyKey","dataSourceId","collectionRunId","factKind","externalId","contentHash","observedAt","startsAt","endsAt",payload,"isDemo")
    VALUES (${stableId("signal-fact", input.idempotencyKey)},${input.idempotencyKey},${input.dataSourceId},${input.collectionRunId},'MARKET_SIGNAL',${input.externalId},${input.contentHash},${input.observedAt},${input.startsAt},${input.endsAt},${JSON.stringify(input.payload)}::jsonb,${input.isDemo})
    ON CONFLICT ("idempotencyKey") DO NOTHING`;
  const fact = await tx.publicFactVersion.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
  if (fact.contentHash !== input.contentHash || stableHash(fact.payload) !== input.contentHash) throw Error("SIGNAL_FACT_PERSISTED_HASH_MISMATCH");
}
