import { randomUUID } from "node:crypto";

import {
  encryptPersonalData,
  hashPersonalIdentifier,
  issueOpaqueToken,
  prisma,
} from "@tymra/db";
import { afterAll, describe, expect, it } from "vitest";

import { InvalidMagicLinkError, consumeMagicLink } from "@/lib/server/magic-links";

const prefix = `customer-security:${randomUUID()}`;
const created = {
  anonymousCheckIds: [] as string[],
  customerIds: [] as string[],
  priceCheckIds: [] as string[],
  stayQueryIds: [] as string[],
};

describe("Release 1.5 verification and session boundaries", () => {
  afterAll(async () => {
    await prisma.job.deleteMany({ where: { priceCheckId: { in: created.priceCheckIds } } });
    await prisma.usageLedger.deleteMany({ where: { OR: [
      { anonymousCheckId: { in: created.anonymousCheckIds } },
      { customerUserId: { in: created.customerIds } },
    ] } });
    await prisma.priceCheck.deleteMany({ where: { id: { in: created.priceCheckIds } } });
    await prisma.stayQuery.deleteMany({ where: { id: { in: created.stayQueryIds } } });
    await prisma.customerSession.deleteMany({ where: { customerUserId: { in: created.customerIds } } });
    await prisma.magicLink.deleteMany({ where: { anonymousCheckId: { in: created.anonymousCheckIds } } });
    await prisma.anonymousCheck.deleteMany({ where: { id: { in: created.anonymousCheckIds } } });
    await prisma.customerUser.deleteMany({ where: { id: { in: created.customerIds } } });
    await prisma.$disconnect();
  });

  it("atomically consumes one concurrent request, rotates the session and queues one formal check", async () => {
    const sessionSecret = process.env.SESSION_SECRET!;
    const accessSecret = process.env.ACCESS_KEY_SECRET!;
    const encryptionKey = process.env.DATA_ENCRYPTION_KEY!;
    const email = `${prefix}@tymra.test`;
    const emailHash = hashPersonalIdentifier(email, accessSecret);
    const encryptedEmail = encryptPersonalData(email, encryptionKey);
    const customer = await prisma.customerUser.create({
      data: { emailHash, encryptedEmail, locale: "en", marketingConsent: false },
    });
    created.customerIds.push(customer.id);
    const oldSession = await prisma.customerSession.create({
      data: { customerUserId: customer.id, tokenHash: `${prefix}:old-session`, expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const check = await createAnonymousCheck("concurrent");
    const token = issueOpaqueToken(sessionSecret);
    await prisma.magicLink.create({
      data: {
        tokenHash: token.tokenHash,
        idempotencyKey: `${prefix}:concurrent-link`,
        emailHash,
        encryptedEmail,
        locale: "en",
        anonymousCheckId: check.id,
        customerUserId: customer.id,
        marketingConsent: true,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    const outcomes = await Promise.allSettled([consumeMagicLink(token.token), consumeMagicLink(token.token)]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const rejected = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(rejected?.reason).toBeInstanceOf(InvalidMagicLinkError);
    const priceChecks = await prisma.priceCheck.findMany({ where: { anonymousCheckId: check.id } });
    expect(priceChecks).toHaveLength(1);
    created.priceCheckIds.push(priceChecks[0]!.id);
    if (priceChecks[0]!.stayQueryId) created.stayQueryIds.push(priceChecks[0]!.stayQueryId);
    expect(await prisma.job.count({ where: { priceCheckId: priceChecks[0]!.id, type: "RATE_COLLECTION" } })).toBe(1);
    expect(await prisma.customerSession.count({ where: { customerUserId: customer.id, revokedAt: null } })).toBe(1);
    expect(await prisma.customerSession.findUnique({ where: { id: oldSession.id } })).toMatchObject({ revokedAt: expect.any(Date) });
    expect(await prisma.customerUser.findUnique({ where: { id: customer.id } })).toMatchObject({ marketingConsent: true });
    await expect(consumeMagicLink(token.token)).rejects.toBeInstanceOf(InvalidMagicLinkError);
  });

  it("rejects an expired link without activating a customer or session", async () => {
    const email = `expired-${prefix}@tymra.test`;
    const token = issueOpaqueToken(process.env.SESSION_SECRET!);
    const check = await createAnonymousCheck("expired");
    await prisma.magicLink.create({
      data: {
        tokenHash: token.tokenHash,
        idempotencyKey: `${prefix}:expired-link`,
        emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!),
        encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!),
        locale: "en",
        anonymousCheckId: check.id,
        expiresAt: new Date(Date.now() - 1_000),
      },
    });

    await expect(consumeMagicLink(token.token)).rejects.toBeInstanceOf(InvalidMagicLinkError);
    expect(await prisma.anonymousCheck.findUnique({ where: { id: check.id } })).toMatchObject({ customerUserId: null });
  });

  it("allows the one additional rolling Free check after the included report", async () => {
    const email = `${prefix}@tymra.test`;
    const emailHash = hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!);
    const customer = await prisma.customerUser.findUniqueOrThrow({ where: { emailHash } });
    const beforeChecks = await prisma.priceCheck.count({ where: { customerUserId: customer.id } });
    expect(beforeChecks).toBe(1);
    const check = await createAnonymousCheck("quota");
    const token = issueOpaqueToken(process.env.SESSION_SECRET!);
    await prisma.magicLink.create({
      data: {
        tokenHash: token.tokenHash,
        idempotencyKey: `${prefix}:quota-link`,
        emailHash,
        encryptedEmail: customer.encryptedEmail,
        locale: "en",
        anonymousCheckId: check.id,
        customerUserId: customer.id,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    const result = await consumeMagicLink(token.token);

    expect(result).toMatchObject({ quotaReached: false, priceCheckId: expect.any(String), customerUserId: customer.id });
    expect(await prisma.priceCheck.count({ where: { customerUserId: customer.id } })).toBe(beforeChecks + 1);
    if (result.priceCheckId) {
      created.priceCheckIds.push(result.priceCheckId);
      const createdCheck = await prisma.priceCheck.findUniqueOrThrow({ where: { id: result.priceCheckId } });
      if (createdCheck.stayQueryId) created.stayQueryIds.push(createdCheck.stayQueryId);
    }
    expect(await prisma.customerSession.count({ where: { customerUserId: customer.id, revokedAt: null } })).toBe(1);
  });

  it("serializes two different links for one customer before checking and enqueueing quota", async () => {
    const email = `cross-link-${prefix}@tymra.test`;
    const emailHash = hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!);
    const encryptedEmail = encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!);
    const customer = await prisma.customerUser.create({ data: { emailHash, encryptedEmail, locale: "en" } });
    created.customerIds.push(customer.id);
    const checks = await Promise.all([createAnonymousCheck("cross-link-a"), createAnonymousCheck("cross-link-b")]);
    const tokens = checks.map(() => issueOpaqueToken(process.env.SESSION_SECRET!));
    await Promise.all(checks.map((check, index) => prisma.magicLink.create({
      data: {
        tokenHash: tokens[index]!.tokenHash,
        idempotencyKey: `${prefix}:cross-link-${index}`,
        emailHash,
        encryptedEmail,
        locale: "en",
        anonymousCheckId: check.id,
        customerUserId: customer.id,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    })));

    const outcomes = await Promise.allSettled(tokens.map((token) => consumeMagicLink(token.token)));
    expect(outcomes.every((outcome) => outcome.status === "fulfilled")).toBe(true);
    const results = outcomes.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
    expect(results.filter((result) => result.priceCheckId !== null)).toHaveLength(2);
    expect(results.filter((result) => result.quotaReached && result.priceCheckId === null)).toHaveLength(0);

    const priceChecks = await prisma.priceCheck.findMany({ where: { customerUserId: customer.id } });
    expect(priceChecks).toHaveLength(2);
    created.priceCheckIds.push(...priceChecks.map((item) => item.id));
    created.stayQueryIds.push(...priceChecks.flatMap((item) => item.stayQueryId ? [item.stayQueryId] : []));
    expect(await prisma.job.count({ where: { priceCheckId: { in: priceChecks.map((item) => item.id) }, type: "RATE_COLLECTION" } })).toBe(2);
  });
});

async function createAnonymousCheck(suffix: string) {
  const check = await prisma.anonymousCheck.create({
    data: {
      locale: "en",
      platform: "BOOKING",
      listingId: `${prefix}:${suffix}`,
      cacheKey: `${prefix}:${suffix}:cache`,
      idempotencyKey: `${prefix}:${suffix}:check`,
      status: "ROUGH_READY",
      pricingContext: {
        source: "OTA_DEFAULT",
        checkIn: "2026-09-10",
        checkOut: "2026-09-11",
        adults: 2,
        children: 0,
        units: 1,
        currency: "NZD",
        timezone: "Pacific/Auckland",
      },
      propertyId: "demo-property-central",
      unitId: "demo-unit-central",
      expiresAt: new Date(Date.now() + 86_400_000),
      isDemo: true,
    },
  });
  created.anonymousCheckIds.push(check.id);
  return check;
}
