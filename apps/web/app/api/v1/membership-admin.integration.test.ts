import { randomUUID } from "node:crypto";

import { encryptPersonalData, hashOpaqueToken, hashPersonalIdentifier, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createAdminSession } from "@/lib/server/admin-auth";
import { PATCH as updateCustomer } from "./admin/customers/[customerId]/route";
import { PATCH as updateDataRequest } from "./admin/data-requests/[requestId]/route";
import { ensureBenefitGroup } from "@/lib/server/membership/member-risk";

const suffix = randomUUID();
let customerId = "";
let dataRequestId = "";
let deletionCustomerId = "";
let deletionRequestId = "";
let token = "";
let riskCaseId = "";
let benefitGroupId = "";

describe("membership administrator boundaries", () => {
  beforeAll(async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { active: true } });
    token = (await createAdminSession(admin.id)).token;
    const email = `membership-admin-${suffix}@tymra.test`;
    const customer = await prisma.customerUser.create({ data: { emailHash: hashPersonalIdentifier(email, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(email, process.env.DATA_ENCRYPTION_KEY!), locale: "en" } });
    customerId = customer.id;
    await prisma.membershipSubscription.create({ data: { customerUserId: customer.id } });
    const group = await prisma.$transaction((transaction) => ensureBenefitGroup(transaction, customer.id));
    benefitGroupId = group.benefitGroupId;
    riskCaseId = (await prisma.membershipRiskCase.create({ data: { customerUserId: customer.id, benefitGroupId, outcome: "CHALLENGE", action: "MEMBER_PRICE_CHECK", reasonCodes: ["MULTIPLE_ACCOUNTS_ON_DEVICE"] } })).id;
    dataRequestId = (await prisma.customerDataRequest.create({ data: { customerUserId: customer.id, type: "EXPORT" } })).id;
    const deletionEmail = `membership-delete-${suffix}@tymra.test`;
    const deletionCustomer = await prisma.customerUser.create({ data: { emailHash: hashPersonalIdentifier(deletionEmail, process.env.ACCESS_KEY_SECRET!), encryptedEmail: encryptPersonalData(deletionEmail, process.env.DATA_ENCRYPTION_KEY!), locale: "en", marketingConsent: true } });
    deletionCustomerId = deletionCustomer.id;
    await prisma.membershipSubscription.create({ data: { customerUserId: deletionCustomer.id } });
    deletionRequestId = (await prisma.customerDataRequest.create({ data: { customerUserId: deletionCustomer.id, type: "DELETE" } })).id;
  });

  afterAll(async () => {
    await prisma.membershipRiskCase.deleteMany({ where: { benefitGroupId } });
    await prisma.customerUser.deleteMany({ where: { id: { in: [customerId, deletionCustomerId] } } });
    await prisma.benefitGroup.deleteMany({ where: { id: benefitGroupId } });
    await prisma.adminSession.deleteMany({ where: { tokenHash: hashOpaqueToken(token, process.env.SESSION_SECRET!) } });
    await prisma.$disconnect();
  });

  it("rejects customer mutations without an Admin session", async () => {
    const request = new NextRequest(`https://ops.tymra.test/api/v1/admin/customers/${customerId}`, { method: "PATCH", headers: { origin: "https://ops.tymra.test", "content-type": "application/json" }, body: JSON.stringify({ action: "SET_PLAN", value: "PRO", reason: "Test correction" }) });
    expect((await updateCustomer(request, { params: { customerId } })).status).toBe(403);
  });

  it("updates membership and customer suspension with append-only audits", async () => {
    const planResponse = await updateCustomer(adminRequest(`/api/v1/admin/customers/${customerId}`, { action: "SET_PLAN", value: "PRO", reason: "Verified billing correction" }), { params: { customerId } });
    expect(planResponse.status).toBe(200);
    const suspensionResponse = await updateCustomer(adminRequest(`/api/v1/admin/customers/${customerId}`, { action: "SUSPEND_CUSTOMER", reason: "Security review requested" }), { params: { customerId } });
    expect(suspensionResponse.status).toBe(200);
    expect(await prisma.membershipSubscription.findUnique({ where: { customerUserId: customerId } })).toMatchObject({ plan: "PRO" });
    expect(await prisma.customerUser.findUnique({ where: { id: customerId } })).toMatchObject({ status: "SUSPENDED" });
    expect(await prisma.auditEvent.count({ where: { entityId: customerId } })).toBe(2);
  });

  it("handles a customer data request and records before/after status", async () => {
    const response = await updateDataRequest(adminRequest(`/api/v1/admin/data-requests/${dataRequestId}`, { status: "COMPLETED", reason: "Export delivered through approved channel", evidenceReference: "support-delivery-001" }), { params: { requestId: dataRequestId } });
    expect(response.status).toBe(200);
    expect(await prisma.customerDataRequest.findUnique({ where: { id: dataRequestId } })).toMatchObject({ status: "COMPLETED" });
    const audit = await prisma.auditEvent.findFirstOrThrow({ where: { entityId: dataRequestId } });
    expect(audit.payload).toMatchObject({ previousStatus: "PENDING", status: "COMPLETED" });
  });

  it("resolves a member risk case only through a reasoned audited Admin action", async () => {
    const response = await updateCustomer(adminRequest(`/api/v1/admin/customers/${customerId}`, { action: "RESOLVE_RISK_ALLOW", value: riskCaseId, reason: "Verified legitimate property manager use" }), { params: { customerId } });
    expect(response.status).toBe(200);
    expect(await prisma.membershipRiskCase.findUniqueOrThrow({ where: { id: riskCaseId } })).toMatchObject({ status: "APPROVED", resolvedByAdminId: expect.any(String), adminNote: "Verified legitimate property manager use" });
    expect(await prisma.auditEvent.findFirst({ where: { entityId: customerId, eventType: "customer_resolve_risk_allow" } })).toBeTruthy();
  });

  it("tombstones personal identity and disables service when approved deletion completes", async () => {
    const response = await updateDataRequest(adminRequest(`/api/v1/admin/data-requests/${deletionRequestId}`, { status: "COMPLETED", reason: "Approved privacy deletion workflow", evidenceReference: "privacy-approval-001" }), { params: { requestId: deletionRequestId } });
    expect(response.status).toBe(200);
    const deleted = await prisma.customerUser.findUniqueOrThrow({ where: { id: deletionCustomerId }, include: { membership: true } });
    expect(deleted).toMatchObject({ status: "DELETED", marketingConsent: false, membership: { status: "CANCELLED" } });
    expect(deleted.emailHash).not.toContain("membership-delete");
  });
});

function adminRequest(path: string, body: unknown) {
  return new NextRequest(`https://ops.tymra.test${path}`, { method: "PATCH", headers: { origin: "https://ops.tymra.test", "content-type": "application/json", cookie: `tymra_admin_session=${token}` }, body: JSON.stringify(body) });
}
