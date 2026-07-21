import { randomUUID } from "node:crypto";

import { encryptPersonalData, hashPersonalIdentifier, issueOpaqueToken, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { customerSessionCookie } from "@/lib/server/customer-auth";

import { GET as getCustomerCheck } from "./customer/checks/[checkId]/route";
import { POST as acknowledgeCustomerCheck } from "./customer/checks/[checkId]/acknowledge/route";

const baseUrl = "https://tymra.test";
const created = { customerIds: [] as string[], sessionIds: [] as string[], checkId: "", stayQueryId: "" };
let ownerCookie = "";
let otherCookie = "";

describe("customer report access isolation", () => {
  beforeAll(async () => {
    const property = await prisma.property.findUniqueOrThrow({ where: { id: "demo-property-central" } });
    const unit = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: "demo-unit-central" } });
    const sessionSecret = process.env.SESSION_SECRET!;
    const accessSecret = process.env.ACCESS_KEY_SECRET!;
    const encryptionSecret = process.env.DATA_ENCRYPTION_KEY!;

    const ownerEmail = `owner-${randomUUID()}@tymra.test`;
    const otherEmail = `other-${randomUUID()}@tymra.test`;
    const [owner, other] = await Promise.all([
      prisma.customerUser.create({ data: { emailHash: hashPersonalIdentifier(ownerEmail, accessSecret), encryptedEmail: encryptPersonalData(ownerEmail, encryptionSecret), locale: "en" } }),
      prisma.customerUser.create({ data: { emailHash: hashPersonalIdentifier(otherEmail, accessSecret), encryptedEmail: encryptPersonalData(otherEmail, encryptionSecret), locale: "en" } }),
    ]);
    created.customerIds.push(owner.id, other.id);

    const ownerToken = issueOpaqueToken(sessionSecret);
    const otherToken = issueOpaqueToken(sessionSecret);
    const sessions = await Promise.all([
      prisma.customerSession.create({ data: { customerUserId: owner.id, tokenHash: ownerToken.tokenHash, expiresAt: new Date(Date.now() + 600_000) } }),
      prisma.customerSession.create({ data: { customerUserId: other.id, tokenHash: otherToken.tokenHash, expiresAt: new Date(Date.now() + 600_000) } }),
    ]);
    created.sessionIds.push(...sessions.map((session) => session.id));
    ownerCookie = `${customerSessionCookie}=${ownerToken.token}`;
    otherCookie = `${customerSessionCookie}=${otherToken.token}`;

    const stayQuery = await prisma.stayQuery.create({
      data: {
        checkIn: new Date("2026-09-10T00:00:00.000Z"),
        checkOut: new Date("2026-09-11T00:00:00.000Z"),
        adults: 2,
        children: 0,
        units: 1,
        nights: 1,
        currency: "NZD",
        cancellationCategory: "STANDARD",
        timezone: "Pacific/Auckland",
      },
    });
    created.stayQueryId = stayQuery.id;
    const access = issueOpaqueToken(accessSecret);
    const check = await prisma.priceCheck.create({
      data: {
        rawInput: "BOOKING:customer-access-test",
        locale: "en",
        emailHash: owner.emailHash,
        encryptedEmail: owner.encryptedEmail,
        serviceConsent: true,
        marketingConsent: false,
        propertyId: property.id,
        unitId: unit.id,
        stayQueryId: stayQuery.id,
        marketKey: "christchurch",
        status: "PUBLISHED",
        accessKeyHash: access.tokenHash,
        idempotencyKey: `customer-access:${randomUUID()}`,
        rulesVersion: "BR-v1.2+R15-D025",
        isDemo: true,
        customerUserId: owner.id,
      },
    });
    created.checkId = check.id;
  });

  afterAll(async () => {
    if (created.checkId) await prisma.priceCheck.deleteMany({ where: { id: created.checkId } });
    if (created.stayQueryId) await prisma.stayQuery.deleteMany({ where: { id: created.stayQueryId } });
    await prisma.customerSession.deleteMany({ where: { id: { in: created.sessionIds } } });
    await prisma.customerUser.deleteMany({ where: { id: { in: created.customerIds } } });
    await prisma.$disconnect();
  });

  it("returns the report to its owner", async () => {
    const response = await getCustomerCheck(request(created.checkId, ownerCookie), { params: { checkId: created.checkId } });
    expect(response.status).toBe(200);
    expect((await response.json()).data.id).toBe(created.checkId);
  });

  it("does not reveal whether another customer's report exists", async () => {
    const response = await getCustomerCheck(request(created.checkId, otherCookie), { params: { checkId: created.checkId } });
    expect(response.status).toBe(404);
  });

  it("requires authentication and only lets the owner acknowledge in-page delivery", async () => {
    const unauthorized = await getCustomerCheck(request(created.checkId), { params: { checkId: created.checkId } });
    expect(unauthorized.status).toBe(401);
    const forbidden = await acknowledgeCustomerCheck(request(created.checkId, otherCookie, "POST"), { params: { checkId: created.checkId } });
    expect(forbidden.status).toBe(404);
    const acknowledged = await acknowledgeCustomerCheck(request(created.checkId, ownerCookie, "POST"), { params: { checkId: created.checkId } });
    expect(acknowledged.status).toBe(200);
    expect((await acknowledged.json()).data.acknowledged).toBe(true);
  });
});

function request(checkId: string, cookie?: string, method = "GET") {
  return new NextRequest(`${baseUrl}/api/v1/customer/checks/${checkId}`, {
    method,
    headers: cookie ? { cookie } : undefined,
  });
}
