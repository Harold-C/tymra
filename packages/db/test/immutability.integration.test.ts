import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "../src";

describe("immutable market history", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("rejects mutation of an existing Rate Observation", async () => {
    const observation = await prisma.rateObservation.findFirstOrThrow({ where: { isDemo: true } });
    await expect(
      prisma.rateObservation.update({
        where: { id: observation.id },
        data: { effectiveNightlyTotalMinor: observation.effectiveNightlyTotalMinor + 1 },
      }),
    ).rejects.toThrow(/append-only/);
  });

  it("rejects mutation of a published Result Version", async () => {
    const result = await prisma.resultVersion.findFirstOrThrow({ where: { status: "PUBLISHED", isDemo: true } });
    await expect(
      prisma.resultVersion.update({ where: { id: result.id }, data: { analysisVersion: "mutated" } }),
    ).rejects.toThrow(/immutable/);
  });

  it("allows a status-only supersession while preserving published content", async () => {
    const result = await prisma.resultVersion.findFirstOrThrow({ where: { status: "PUBLISHED", isDemo: true } });

    await expect(
      prisma.$transaction(async (transaction) => {
        const superseded = await transaction.resultVersion.update({
          where: { id: result.id },
          data: { status: "SUPERSEDED" },
        });
        expect(superseded.status).toBe("SUPERSEDED");
        expect(superseded.payload).toEqual(result.payload);
        throw new Error("ROLLBACK_LIFECYCLE_TEST");
      }),
    ).rejects.toThrow("ROLLBACK_LIFECYCLE_TEST");

    expect((await prisma.resultVersion.findUniqueOrThrow({ where: { id: result.id } })).status).toBe("PUBLISHED");
  });

  it("rejects changing content during a lifecycle transition", async () => {
    const result = await prisma.resultVersion.findFirstOrThrow({ where: { status: "PUBLISHED", isDemo: true } });
    await expect(
      prisma.resultVersion.update({
        where: { id: result.id },
        data: { status: "SUPERSEDED", analysisVersion: "mutated-during-transition" },
      }),
    ).rejects.toThrow(/immutable/);
  });

  it("rolls back append-only Feedback when a mutation is attempted", async () => {
    const check = await prisma.priceCheck.findFirstOrThrow({ where: { isDemo: true } });
    const idempotencyKey = `integration-feedback:${randomUUID()}`;

    await expect(
      prisma.$transaction(async (transaction) => {
        const feedback = await transaction.feedback.create({
          data: {
            priceCheckId: check.id,
            type: "INSIGHT_USEFUL",
            idempotencyKey,
            isDemo: true,
          },
        });
        await transaction.feedback.update({ where: { id: feedback.id }, data: { comment: "mutation" } });
      }),
    ).rejects.toThrow(/append-only/);

    expect(await prisma.feedback.count({ where: { idempotencyKey } })).toBe(0);
  });
});
