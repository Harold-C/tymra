import { randomUUID } from "node:crypto";

import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { customerMembershipRiskSupport, listMembershipRiskCases, membershipRiskSummary } from "@/lib/server/membership-risk-support";

const suffix = randomUUID();
let customerId = "";
let otherCustomerId = "";
let oldCaseId = "";
let otherCaseId = "";
const since = new Date(Date.now() - 30 * 86_400_000);

describe("membership risk support completeness", () => {
  beforeAll(async () => {
    for (const name of ["risk-regression", "risk-other"]) {
      const email = `${name}-${suffix}@tymra.test`;
      const customer = await prisma.customerUser.create({ data: {
        emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!),
        encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), locale: "en",
      } });
      if (!customerId) customerId = customer.id;
      else otherCustomerId = customer.id;
    }
    await prisma.membershipRiskCase.createMany({ data: Array.from({ length: 1005 }, (_, index) => ({
      customerUserId: customerId, status: index < 600 ? "APPROVED" as const : "DENIED" as const,
      outcome: "CHALLENGE" as const, action: `BULK_${suffix}`, reasonCodes: ["BULK_RECENT"],
      appealReason: index < 10 ? "Synthetic appeal" : null,
    })) });
    await prisma.membershipRiskCase.createMany({ data: Array.from({ length: 30 }, (_, index) => ({
      customerUserId: customerId, outcome: "CHALLENGE" as const, action: `OPEN_${suffix}`,
      reasonCodes: ["OPEN_RECENT"], createdAt: new Date(Date.now() - index * 1000),
    })) });
    oldCaseId = (await prisma.membershipRiskCase.create({ data: {
      customerUserId: customerId, outcome: "COOLDOWN", action: `OLD_${suffix}`,
      reasonCodes: ["OLD_PENDING"], createdAt: new Date(Date.now() - 45 * 86_400_000),
    } })).id;
    await prisma.membershipRiskCase.createMany({ data: [
      { customerUserId: customerId, status: "RESOLVED", outcome: "CHALLENGE", action: suffix, reasonCodes: [], createdAt: new Date(Date.now() - 45 * 86_400_000) },
      { customerUserId: customerId, status: "RESOLVED", outcome: "CHALLENGE", action: suffix, reasonCodes: { legacy: true } },
      { customerUserId: customerId, status: "RESOLVED", outcome: "CHALLENGE", action: suffix, reasonCodes: ["MIXED", 123, null] },
    ] });
    otherCaseId = (await prisma.membershipRiskCase.create({ data: { customerUserId: otherCustomerId, outcome: "CHALLENGE", action: `OTHER_${suffix}` } })).id;
  });

  afterAll(async () => {
    await prisma.membershipRiskCase.deleteMany({ where: { customerUserId: { in: [customerId, otherCustomerId] } } });
    await prisma.customerUser.deleteMany({ where: { id: { in: [customerId, otherCustomerId] } } });
    await prisma.$disconnect();
  });

  it("aggregates all recent cases beyond 1000 and counts older open work separately", async () => {
    const summary = await membershipRiskSummary(since, customerId);
    expect(summary).toMatchObject({ total: 1037, open: 31, appealed: 10, approved: 600, reviewed: 1005 });
    expect(summary.topReasons).toEqual([
      { reason: "BULK_RECENT", count: 1005 }, { reason: "OPEN_RECENT", count: 30 }, { reason: "MIXED", count: 1 },
    ]);
  });

  it("keeps older open cases reachable through the paginated inbox filter", async () => {
    const open = await listMembershipRiskCases({ q: customerId, status: "OPEN", page: "2" });
    expect(open.total).toBe(31);
    expect(open.cases.map(item => item.id)).toContain(oldCaseId);
    expect(open.cases).toHaveLength(6);
    const recent = await listMembershipRiskCases({ q: customerId, status: "OPEN", period: "30d", pageSize: "100" });
    expect(recent.total).toBe(30);
    expect(recent.cases.map(item => item.id)).not.toContain(oldCaseId);
  });

  it("shows the selected case even outside the customer's first page", async () => {
    const firstPage = await customerMembershipRiskSupport(customerId, {});
    expect(firstPage.total).toBe(1039);
    expect(firstPage.open).toBe(31);
    expect(firstPage.cases).toHaveLength(25);
    expect(firstPage.cases.map(item => item.id)).not.toContain(oldCaseId);
    const selected = await customerMembershipRiskSupport(customerId, { riskCase: oldCaseId });
    expect(selected.cases[0].id).toBe(oldCaseId);
    expect(selected.cases).toHaveLength(26);
    expect(selected.open).toBe(31);
  });

  it("never brings another customer's case into a focused detail view", async () => {
    const support = await customerMembershipRiskSupport(customerId, { riskCase: otherCaseId, riskPage: "2" });
    expect(support.cases.map(item => item.id)).not.toContain(otherCaseId);
    expect(support.cases.every(item => item.customerUserId === customerId)).toBe(true);
    expect(support.cases.map(item => item.id)).toContain(oldCaseId);
  });
});
