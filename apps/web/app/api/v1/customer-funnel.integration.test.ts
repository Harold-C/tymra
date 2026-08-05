import { randomUUID } from "node:crypto";

import { hashPersonalIdentifier, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { POST as createRoughCheck } from "./rough-checks/route";
import { POST as unlockRoughCheck } from "./rough-checks/[checkId]/unlock/route";

const baseUrl = "https://tymra.test";
const deviceId = `integration-device-${randomUUID()}`;
const ipAddress = `integration-ip-${randomUUID()}`;
const email = `customer-funnel-${randomUUID()}@tymra.test`;
const checkIds: string[] = [];
const accessSecret = process.env.ACCESS_KEY_SECRET!;
const deviceHash = hashPersonalIdentifier(deviceId, accessSecret);
const ipHash = hashPersonalIdentifier(ipAddress, accessSecret);
const emailHash = hashPersonalIdentifier(email, accessSecret);
const metricBaseline = new Map<string, number>();

describe("Release 1.5 anonymous customer funnel", () => {
  beforeAll(async () => {
    for (const eventName of ["rough_check_started", "rough_check_completed", "formal_unlock_requested", "verification_email_queued"]) {
      metricBaseline.set(eventName, await funnelMetricTotal(eventName));
    }
  });

  afterAll(async () => {
    await prisma.emailDelivery.deleteMany({ where: { recipientHash: emailHash } });
    await prisma.magicLink.deleteMany({ where: { emailHash } });
    await prisma.usageLedger.deleteMany({ where: { subjectHash: { in: [deviceHash, ipHash, emailHash] } } });
    await prisma.abuseDecision.deleteMany({ where: { subjectHash: { in: [deviceHash, emailHash] } } });
    await prisma.anonymousCheck.deleteMany({ where: { id: { in: checkIds } } });
    await prisma.$disconnect();
  });

  it("rejects a natural address before creating an anonymous check", async () => {
    const response = await createRoughCheck(jsonRequest("/api/v1/rough-checks", {
      input: "123 Colombo Street, Christchurch",
      locale: "en",
      idempotencyKey: `rough-invalid:${randomUUID()}`,
    }));

    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns a rough result before email and isolates cached visitor records", async () => {
    const idempotencyKey = `rough:${randomUUID()}`;
    const body = {
      input: "https://www.booking.com/hotel/nz/christchurch-central-stay.html",
      locale: "en",
      idempotencyKey,
    };
    const first = await createRoughCheck(jsonRequest("/api/v1/rough-checks", body));
    expect([200, 201]).toContain(first.status);
    const firstData = (await first.json()).data;
    checkIds.push(firstData.id);
    expect(firstData.status).toBe("ROUGH_READY");
    expect(firstData.roughResult.pricePosition).toBeTruthy();

    const duplicate = await createRoughCheck(jsonRequest("/api/v1/rough-checks", body));
    expect(duplicate.status).toBe(200);
    expect((await duplicate.json()).data.id).toBe(firstData.id);

    const cached = await createRoughCheck(jsonRequest("/api/v1/rough-checks", {
      ...body,
      idempotencyKey: `rough-cached:${randomUUID()}`,
    }));
    expect(cached.status).toBe(200);
    const cachedData = (await cached.json()).data;
    checkIds.push(cachedData.id);
    expect(cachedData.id).not.toBe(firstData.id);
    expect(cachedData.reused).toBe(true);

    expect(await prisma.priceCheck.count({ where: { anonymousCheckId: { in: checkIds } } })).toBe(0);
    expect(await prisma.emailDelivery.count({ where: { recipientHash: emailHash } })).toBe(0);
    expect(await prisma.usageLedger.count({ where: { action: "ROUGH_CHECK", subjectType: "DEVICE", subjectHash: deviceHash } })).toBe(2);
  });

  it("sends one idempotent verification message and does not start the formal check early", async () => {
    const idempotencyKey = `unlock:${randomUUID()}`;
    const body = {
      email,
      serviceConsent: true,
      marketingConsent: false,
      idempotencyKey,
    };
    const first = await unlockRoughCheck(jsonRequest(`/api/v1/rough-checks/${checkIds[0]}/unlock`, body), {
      params: { checkId: checkIds[0] },
    });
    expect(first.status).toBe(202);
    const neutralPayload = (await first.json()).data;
    expect(neutralPayload.accepted).toBe(true);

    const duplicate = await unlockRoughCheck(jsonRequest(`/api/v1/rough-checks/${checkIds[0]}/unlock`, body), {
      params: { checkId: checkIds[0] },
    });
    expect(duplicate.status).toBe(202);
    expect((await duplicate.json()).data).toEqual(neutralPayload);

    const cooledDown = await unlockRoughCheck(jsonRequest(`/api/v1/rough-checks/${checkIds[0]}/unlock`, {
      ...body,
      idempotencyKey: `unlock-cooldown:${randomUUID()}`,
    }), { params: { checkId: checkIds[0] } });
    expect(cooledDown.status).toBe(202);
    expect((await cooledDown.json()).data).toEqual(neutralPayload);

    expect(await prisma.magicLink.count({ where: { emailHash } })).toBe(1);
    expect(await prisma.emailDelivery.count({ where: { recipientHash: emailHash, type: "VERIFY_AND_SIGN_IN", status: "SENT" } })).toBe(1);
    expect(await prisma.customerUser.count({ where: { emailHash } })).toBe(0);
    expect(await prisma.priceCheck.count({ where: { anonymousCheckId: checkIds[0] } })).toBe(0);
  });

  it("applies a cooldown after the documented device rough-check limit", async () => {
    for (let index = 0; index < 3; index += 1) {
      const response = await createRoughCheck(jsonRequest("/api/v1/rough-checks", {
        input: "https://www.airbnb.co.nz/rooms/12345678",
        locale: "en",
        idempotencyKey: `rough-limit:${index}:${randomUUID()}`,
      }));
      expect([200, 201]).toContain(response.status);
      checkIds.push((await response.json()).data.id);
    }

    const limited = await createRoughCheck(jsonRequest("/api/v1/rough-checks", {
      input: "https://www.airbnb.co.nz/rooms/87654321",
      locale: "en",
      idempotencyKey: `rough-limited:${randomUUID()}`,
    }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
    expect(await prisma.abuseDecision.count({ where: { action: "ROUGH_CHECK", subjectHash: deviceHash, outcome: "COOLDOWN" } })).toBe(1);
  });

  it("records only aggregate privacy-safe funnel counters", async () => {
    expect(await funnelMetricTotal("rough_check_started")).toBeGreaterThanOrEqual(metricBaseline.get("rough_check_started")! + 6);
    expect(await funnelMetricTotal("rough_check_completed")).toBeGreaterThanOrEqual(metricBaseline.get("rough_check_completed")! + 5);
    expect(await funnelMetricTotal("formal_unlock_requested")).toBeGreaterThanOrEqual(metricBaseline.get("formal_unlock_requested")! + 2);
    expect(await funnelMetricTotal("verification_email_queued")).toBe(metricBaseline.get("verification_email_queued")! + 1);
    const metrics = await prisma.funnelMetricDaily.findMany({ where: { eventName: { in: [...metricBaseline.keys()] } } });
    expect(JSON.stringify(metrics)).not.toContain(email);
    expect(JSON.stringify(metrics)).not.toContain(checkIds[0]);
    expect(metrics.every((metric) => !metric.dimensionKey.includes("http") && !metric.dimensionKey.includes("?"))).toBe(true);
  });

  it("returns the terminal no-default-quote state without starting verification or formal work", async () => {
    const response = await createRoughCheck(new NextRequest(`${baseUrl}/api/v1/rough-checks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `tymra_device=no-quote-${randomUUID()}`,
        "x-forwarded-for": `no-quote-${randomUUID()}`,
      },
      body: JSON.stringify({
        input: "https://www.booking.com/hotel/nz/no-price-integration.html",
        locale: "en",
        idempotencyKey: `rough-no-quote:${randomUUID()}`,
      }),
    }));

    expect(response.status).toBe(201);
    const check = (await response.json()).data;
    checkIds.push(check.id);
    expect(check).toMatchObject({ status: "NO_DEFAULT_QUOTE", failureReason: "NO_DEFAULT_QUOTE", roughResult: null });
    expect(await prisma.magicLink.count({ where: { anonymousCheckId: check.id } })).toBe(0);
    expect(await prisma.priceCheck.count({ where: { anonymousCheckId: check.id } })).toBe(0);
  });
});

async function funnelMetricTotal(eventName: string) {
  const result = await prisma.funnelMetricDaily.aggregate({ where: { eventName }, _sum: { count: true } });
  return result._sum.count ?? 0;
}

function jsonRequest(path: string, body: unknown) {
  return new NextRequest(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: `tymra_device=${deviceId}`,
      "x-forwarded-for": ipAddress,
    },
    body: JSON.stringify(body),
  });
}
