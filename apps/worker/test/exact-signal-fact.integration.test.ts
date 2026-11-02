import { randomUUID } from "node:crypto";
import { afterAll, expect, it } from "vitest";
import { prisma } from "@tymra/db";
import { insertExactSignalFact } from "../src/services/worker/collection/exact-signal-fact";
import { stableHash } from "../src/services/worker/helpers";

afterAll(() => prisma.$disconnect());
it("retains binary64 JSON values, verifies the persisted digest, and never changes an existing fact", async () => {
  const payload = { metadata: { magnitude: 2.4024295338373154 }, nested: [0.12345678901234567] };
  const input = { idempotencyKey: randomUUID(), dataSourceId: "isolated", collectionRunId: "isolated", externalId: "isolated",
    contentHash: stableHash(payload), payload, observedAt: new Date(), startsAt: new Date(), endsAt: new Date(), isDemo: true };
  const rollback = new Error("ROLLBACK_ISOLATED_FACT_TEST");
  await expect(prisma.$transaction(async tx => {
    await insertExactSignalFact(tx, input);
    await insertExactSignalFact(tx, input);
    const facts = await tx.publicFactVersion.findMany({ where: { idempotencyKey: input.idempotencyKey } });
    expect(facts).toHaveLength(1);
    expect(facts[0]!.payload).toEqual(payload);
    expect(stableHash(facts[0]!.payload)).toBe(input.contentHash);
    await expect(insertExactSignalFact(tx, { ...input, contentHash: "wrong" })).rejects.toThrow("INPUT_HASH_MISMATCH");
    // A preexisting mismatched fact is preserved, not silently rewritten on conflict.
    const old = await tx.publicFactVersion.create({ data: { ...input, payload: { metadata: { magnitude: 2.402429533837315 } }, idempotencyKey: randomUUID(), factKind: "MARKET_SIGNAL" } });
    expect(stableHash(old.payload)).not.toBe(input.contentHash);
    await expect(insertExactSignalFact(tx, { ...input, idempotencyKey: old.idempotencyKey })).rejects.toThrow("PERSISTED_HASH_MISMATCH");
    expect(await tx.publicFactVersion.findUnique({ where: { id: old.id } })).toEqual(old);
    throw rollback;
  })).rejects.toBe(rollback);
  expect(await prisma.publicFactVersion.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
});
