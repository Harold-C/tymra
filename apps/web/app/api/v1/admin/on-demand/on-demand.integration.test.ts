import { randomUUID } from "node:crypto";
import { encryptPersonalData, prisma } from "@tymra/db";
import { afterAll, describe, expect, it } from "vitest";
import { createInternalOnDemandRequest } from "@/lib/server/internal-on-demand";

describe("Admin diagnostics preserve the original service request", () => {
  afterAll(async () => { await prisma.$disconnect(); });
  it("rejects arbitrary new business inputs on the retired compatibility API", async () => {
    await expect(createInternalOnDemandRequest({ id: "unused", email: "test@tymra.test" }, { target: "https://www.booking.com/hotel/nz/example.html", checkIn: "2027-01-01", checkOut: "2027-01-02", adults: 2 })).rejects.toThrow();
  });
  it("reuses incident recovery with original input, ownership and concurrent idempotency", async () => {
    const suffix = randomUUID();
    const admin = await prisma.adminUser.create({ data: { email: `on-demand-${suffix}@tymra.test`, passwordHash: "synthetic-not-for-login" } });
    const check = await prisma.priceCheck.create({ data: { rawInput: "Synthetic original customer input", status: "EXCEPTION", locale: "en", emailHash: suffix, encryptedEmail: encryptPersonalData("test@tymra.test", process.env.DATA_ENCRYPTION_KEY!), serviceConsent: true, accessKeyHash: suffix, idempotencyKey: suffix, marketKey: "christchurch", isDemo: true } });
    const incident = await prisma.exceptionCase.create({ data: { priceCheckId: check.id, type: "SOURCE_FAILURE", priority: "P1", evidence: {}, recommendation: "Restore original input", allowedActions: [], isDemo: true } });
    const original = await prisma.job.create({ data: { type: "RATE_COLLECTION", status: "FAILED", payload: { priceCheckId: check.id, preserved: true }, priceCheckId: check.id, idempotencyKey: randomUUID(), queueName: "test" } });
    const results = await Promise.all([1, 2].map(() => createInternalOnDemandRequest(admin, { exceptionId: incident.id, action: "RECOLLECT", reason: "Synthetic incident recovery verification" })));
    expect(results.every(result => result.id === incident.id)).toBe(true);
    const retries = await prisma.job.findMany({ where: { correlationId: `service-recovery:${original.id}` } });
    expect(retries).toHaveLength(1);
    expect(retries[0].payload).toEqual(original.payload);
    expect((await prisma.priceCheck.findUniqueOrThrow({ where: { id: check.id } })).rawInput).toBe(check.rawInput);
  });
});
