import { randomBytes, randomUUID } from "node:crypto";

import { hashOpaqueToken, issueResultLink, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { apiError, apiException } from "@/lib/server/api";
import { adminSessionCookie } from "@/lib/server/admin-auth";

import { GET as getAdminChecks } from "./admin/checks/route";
import { POST as reissueLink } from "./admin/checks/[checkId]/reissue-link/route";
import { POST as adminSignIn } from "./admin/session/route";
import { POST as submitContact } from "./contact/route";
import { GET as getCheck } from "./price-checks/[checkId]/route";
import { POST as confirmProperty } from "./price-checks/[checkId]/confirm-property/route";
import { POST as confirmQuery } from "./price-checks/[checkId]/confirm-query/route";
import { POST as confirmUnit } from "./price-checks/[checkId]/confirm-unit/route";
import { POST as createCheck } from "./price-checks/route";
import { POST as searchProperties } from "./property-search/route";
import { POST as submitFeedback } from "./results/[token]/feedback/route";
import { GET as getResult } from "./results/[token]/route";
import { POST as joinWaitlist } from "./waitlist/route";

const baseUrl = "https://tymra.test";
const adminBaseUrl = "https://ops.tymra.test";
const created = {
  adminSessionId: "",
  checkId: "",
  stayQueryId: "",
  waitlistId: "",
  contactId: "",
  accessTokenId: "",
  reissueDeliveryId: "",
};
let adminCookie = "";
let checkCookie = "";
let resultToken = "";

describe("Release 1 API contracts", () => {
  beforeAll(async () => {
    const admin = await prisma.adminUser.findFirstOrThrow({ where: { active: true } });
    const token = randomBytes(32).toString("base64url");
    const session = await prisma.adminSession.create({
      data: {
        adminUserId: admin.id,
        tokenHash: hashOpaqueToken(token, process.env.SESSION_SECRET!),
        expiresAt: new Date(Date.now() + 600_000),
      },
    });
    created.adminSessionId = session.id;
    adminCookie = `${adminSessionCookie}=${token}`;

    const result = await prisma.resultVersion.findFirstOrThrow({ where: { status: "PUBLISHED", isDemo: true } });
    const issued = await issueResultLink(result.id, process.env.RESULT_TOKEN_SECRET!, 14);
    created.accessTokenId = issued.access.id;
    resultToken = issued.token;
  });

  afterAll(async () => {
    if (created.checkId) {
      const immutableHistory = await prisma.collectionRun.count({ where: { priceCheckId: created.checkId } });
      if (!immutableHistory) {
        await prisma.emailDelivery.deleteMany({ where: { priceCheckId: created.checkId } });
        await prisma.job.deleteMany({ where: { priceCheckId: created.checkId } });
        await prisma.priceCheck.deleteMany({ where: { id: created.checkId } });
        if (created.stayQueryId) await prisma.stayQuery.deleteMany({ where: { id: created.stayQueryId } });
      }
    }
    if (created.reissueDeliveryId) {
      await prisma.job.deleteMany({ where: { payload: { path: ["deliveryId"], equals: created.reissueDeliveryId } } });
      await prisma.emailDelivery.deleteMany({ where: { id: created.reissueDeliveryId } });
    }
    if (created.waitlistId) await prisma.waitlistEntry.deleteMany({ where: { id: created.waitlistId } });
    if (created.contactId) await prisma.contactRequest.deleteMany({ where: { id: created.contactId } });
    if (created.accessTokenId) await prisma.resultAccessToken.deleteMany({ where: { id: created.accessTokenId } });
    if (created.adminSessionId) await prisma.adminSession.deleteMany({ where: { id: created.adminSessionId } });
    await prisma.$disconnect();
  });

  it("searches Property candidates and rejects invalid input", async () => {
    const success = await searchProperties(jsonRequest("/api/v1/property-search", { input: "Christchurch Central Stay", locale: "en" }));
    expect(success.status).toBe(200);
    expect((await success.json()).data.candidates).toHaveLength(1);

    const invalid = await searchProperties(jsonRequest("/api/v1/property-search", { input: "x", locale: "en" }));
    expect(invalid.status).toBe(422);
  });

  it("creates and protects a complete Price Check confirmation flow", async () => {
    const idempotencyKey = `api-integration:${randomUUID()}`;
    const createResponse = await createCheck(jsonRequest("/api/v1/price-checks", {
      email: "api-integration@tymra.test",
      locale: "en",
      input: "Christchurch Central Stay",
      propertyId: "demo-property-central",
      unitId: "demo-unit-central",
      stayQuery: {
        checkIn: "2026-09-10T00:00:00.000Z",
        checkOut: "2026-09-11T00:00:00.000Z",
        adults: 2,
        children: 0,
        units: 1,
        currency: "NZD",
        cancellationCategory: "STANDARD",
        timezone: "Pacific/Auckland",
      },
      serviceConsent: true,
      marketingConsent: false,
      idempotencyKey,
    }));
    expect(createResponse.status).toBe(201);
    const body = await createResponse.json();
    created.checkId = body.data.checkId;
    const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: created.checkId } });
    created.stayQueryId = check.stayQueryId!;
    checkCookie = createResponse.headers.get("set-cookie")!.split(";")[0];
    expect(body.data.status).toBe("NEEDS_CONFIRMATION");

    const forbidden = await getCheck(new NextRequest(`${baseUrl}/api/v1/price-checks/${created.checkId}`), { params: { checkId: created.checkId } });
    expect(forbidden.status).toBe(403);
    const visible = await getCheck(request(`/api/v1/price-checks/${created.checkId}`, { cookie: checkCookie }), { params: { checkId: created.checkId } });
    expect(visible.status).toBe(200);

    expect((await confirmProperty(jsonRequest(`/api/v1/price-checks/${created.checkId}/confirm-property`, { propertyId: "demo-property-central" }, { cookie: checkCookie }), { params: { checkId: created.checkId } })).status).toBe(200);
    expect((await confirmUnit(jsonRequest(`/api/v1/price-checks/${created.checkId}/confirm-unit`, { unitId: "demo-unit-central" }, { cookie: checkCookie }), { params: { checkId: created.checkId } })).status).toBe(200);
    const queued = await confirmQuery(jsonRequest(`/api/v1/price-checks/${created.checkId}/confirm-query`, {
      checkIn: "2026-09-10T00:00:00.000Z",
      checkOut: "2026-09-11T00:00:00.000Z",
      adults: 2,
      children: 0,
      units: 1,
      currency: "NZD",
      cancellationCategory: "STANDARD",
      timezone: "Pacific/Auckland",
    }, { cookie: checkCookie }), { params: { checkId: created.checkId } });
    expect(queued.status).toBe(200);
    expect((await queued.json()).data.status).toBe("QUEUED");
  });

  it("resolves a secure result and accepts idempotent feedback", async () => {
    const response = await getResult(new Request(`${baseUrl}/api/v1/results/redacted`), { params: { token: resultToken } });
    expect(response.status).toBe(200);
    expect((await response.json()).data.state).toBe("VALID");

    const feedback = await submitFeedback(jsonRequest("/api/v1/results/redacted/feedback", {
      feedbackType: "INSIGHT_USEFUL",
      idempotencyKey: `api-feedback:${randomUUID()}`,
    }), { params: { token: resultToken } });
    expect(feedback.status).toBe(201);
    const invalid = await submitFeedback(jsonRequest("/api/v1/results/invalid/feedback", {
      feedbackType: "INSIGHT_USEFUL",
      idempotencyKey: `api-feedback:${randomUUID()}`,
    }), { params: { token: "invalid" } });
    expect(invalid.status).toBe(404);
  });

  it("stores Waitlist and Contact requests without returning personal data", async () => {
    const waitlist = await joinWaitlist(jsonRequest("/api/v1/waitlist", {
      email: "waitlist-api@tymra.test",
      locale: "zh",
      country: "NZ",
      market: "Christchurch",
      marketingConsent: true,
      idempotencyKey: `api-waitlist:${randomUUID()}`,
    }));
    expect(waitlist.status).toBe(201);
    created.waitlistId = (await waitlist.json()).data.waitlistId;

    const contact = await submitContact(jsonRequest("/api/v1/contact", {
      name: "API Test",
      email: "contact-api@tymra.test",
      topic: "Price Check",
      message: "Please review this local API integration request.",
      locale: "en",
    }));
    expect(contact.status).toBe(201);
    const contactBody = await contact.json();
    created.contactId = contactBody.data.contactId;
    expect(contactBody.data.email).toBeUndefined();
  });

  it("enforces Admin authentication, not-found and conflict responses", async () => {
    const unauthorized = await getAdminChecks(new NextRequest(`${baseUrl}/api/v1/admin/checks`));
    expect(unauthorized.status).toBe(403);
    const invalidLogin = await adminSignIn(jsonRequest("/api/v1/admin/session", { email: "missing@tymra.test", password: "incorrect-password" }, { origin: adminBaseUrl }, adminBaseUrl));
    expect(invalidLogin.status).toBe(401);
    const authorized = await getAdminChecks(request("/api/v1/admin/checks", { cookie: adminCookie }));
    expect(authorized.status).toBe(200);

    const missing = await reissueLink(request("/api/v1/admin/checks/missing/reissue-link", { method: "POST", cookie: adminCookie, origin: adminBaseUrl, baseUrl: adminBaseUrl }), { params: { checkId: "missing" } });
    expect(missing.status).toBe(404);
    const noResult = await reissueLink(request("/api/v1/admin/checks/demo-check-property-confirmation/reissue-link", { method: "POST", cookie: adminCookie, origin: adminBaseUrl, baseUrl: adminBaseUrl }), { params: { checkId: "demo-check-property-confirmation" } });
    expect(noResult.status).toBe(409);

    const reissued = await reissueLink(request("/api/v1/admin/checks/demo-check-normal-high/reissue-link", { method: "POST", cookie: adminCookie, origin: adminBaseUrl, baseUrl: adminBaseUrl }), { params: { checkId: "demo-check-normal-high" } });
    expect(reissued.status).toBe(202);
    created.reissueDeliveryId = (await reissued.json()).data.deliveryId;
  });

  it("returns 400, 422, 429, 500 and 503 error contracts", async () => {
    const malformed = await createCheck(new Request(`${baseUrl}/api/v1/price-checks`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": `malformed-${randomUUID()}` }, body: "{" }));
    expect(malformed.status).toBe(400);

    const invalid = await createCheck(jsonRequest("/api/v1/price-checks", {}, { "x-forwarded-for": `invalid-${randomUUID()}` }));
    expect(invalid.status).toBe(422);

    const rateKey = `rate-${randomUUID()}`;
    let limited: Response | null = null;
    for (let index = 0; index < 21; index += 1) {
      limited = await createCheck(jsonRequest("/api/v1/price-checks", {}, { "x-forwarded-for": rateKey }));
    }
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBeTruthy();
    expect(apiException(new Error("test")).status).toBe(500);
    expect(apiError(503, "CHECKS_PAUSED", "Paused").status).toBe(503);
  });
});

function jsonRequest(path: string, body: unknown, headers: Record<string, string> = {}, requestBaseUrl = baseUrl) {
  return new NextRequest(`${requestBaseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function request(path: string, options: { method?: string; cookie?: string; origin?: string; baseUrl?: string } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.origin) headers.origin = options.origin;
  return new NextRequest(`${options.baseUrl ?? baseUrl}${path}`, { method: options.method ?? "GET", headers });
}
