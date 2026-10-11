import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { LogEmailProvider } from "@tymra/providers/email";
import { NextRequest } from "next/server";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import { issueCustomerEmailVerification, VerificationEmailDeliveryError } from "@/lib/server/membership/magic-links";
import { POST as register } from "./customer/auth/register/route";
import { POST as signIn } from "./customer/auth/password/route";
import { POST as resend } from "./customer/auth/verify-email/route";
import { GET as getSession, DELETE as signOut } from "./customer/session/route";

function request(path: string, body?: unknown, cookie?: string, method = "POST") {
  return new NextRequest(`https://tymra.test${path}`, {
    method,
    headers: { origin: "https://tymra.test", "content-type": "application/json", "x-forwarded-for": randomUUID(), ...(cookie ? { cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("first customer registration and recovery", () => {
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => { await prisma.$disconnect(); });

  it("keeps a Free account usable when email fails, supports resend and revokes the session on sign-out", async () => {
    const email = `registration-${randomUUID()}@tymra.test`;
    const password = "synthetic customer registration password";
    const [jobsBefore, adminsBefore] = await Promise.all([prisma.job.count(), prisma.adminUser.count()]);
    const send = vi.spyOn(LogEmailProvider.prototype, "send").mockRejectedValue(new Error("SMTP rejected a synthetic private recipient"));
    const response = await register(request("/api/v1/customer/auth/register", { email, password, locale: "zh", serviceConsent: true }));
    expect(response.status).toBe(201);
    const result = (await response.json()).data;
    expect(result).toMatchObject({ returnTo: "/zh/account?verify=email-unavailable", verificationRequired: true, verificationEmailSent: false });
    const customerId = result.customer.id as string;
    const cookie = `tymra_customer_session=${response.cookies.get("tymra_customer_session")!.value}`;
    expect(response.cookies.get("tymra_customer_session")).toMatchObject({ httpOnly: true, secure: true, sameSite: "lax" });
    expect((await getSession(request("/api/v1/customer/session", undefined, cookie, "GET"))).status).toBe(200);
    expect(await prisma.customerUser.findUniqueOrThrow({ where: { id: customerId } })).toMatchObject({ emailVerifiedAt: null, status: "ACTIVE", marketingConsent: false });
    expect(await prisma.membershipSubscription.findUniqueOrThrow({ where: { customerUserId: customerId } })).toMatchObject({ plan: "FREE", status: "ACTIVE" });
    const failedLink = await prisma.magicLink.findFirstOrThrow({ where: { customerUserId: customerId } });
    expect(failedLink).toMatchObject({ purpose: "VERIFY_CUSTOMER_EMAIL", status: "REVOKED" });
    expect(await prisma.emailDelivery.findUniqueOrThrow({ where: { idempotencyKey: `${failedLink.id}:verify-email` } })).toMatchObject({ status: "FAILED", lastError: "Verification email delivery failed" });
    expect((await resend(request("/api/v1/customer/auth/verify-email", {}, cookie))).status).toBe(503);
    send.mockRestore();
    expect((await resend(request("/api/v1/customer/auth/verify-email", {}, cookie))).status).toBe(202);
    expect(await prisma.magicLink.count({ where: { customerUserId: customerId, status: "PENDING" } })).toBe(1);
    const signedOut = await signOut(request("/api/v1/customer/session", {}, cookie, "DELETE"));
    expect(signedOut.status).toBe(200);
    expect((await getSession(request("/api/v1/customer/session", undefined, cookie, "GET"))).status).toBe(401);
    const signedIn = await signIn(request("/api/v1/customer/auth/password", { email, password }));
    expect(signedIn.status).toBe(201);
    expect((await signedIn.json()).data.customer.id).toBe(customerId);
    expect(await prisma.membershipUsage.count({ where: { customerUserId: customerId } })).toBe(0);
    expect(await prisma.customerPricingUnit.count({ where: { customerUserId: customerId } })).toBe(0);
    expect(await prisma.priceCheck.count({ where: { customerUserId: customerId } })).toBe(0);
    expect(await prisma.job.count()).toBe(jobsBefore);
    expect(await prisma.adminUser.count()).toBe(adminsBefore);
  });

  it("does not claim to send registration verification through the production log provider", async () => {
    const response = await register(request("/api/v1/customer/auth/register", { email: `production-log-${randomUUID()}@tymra.test`, password: "synthetic production log password", locale: "en", serviceConsent: true }));
    expect(response.status).toBe(201);
    const customerId = (await response.json()).data.customer.id as string;
    const before = await prisma.magicLink.count({ where: { customerUserId: customerId } });
    const environment = getEnvironment();
    const original = environment.NODE_ENV;
    const send = vi.spyOn(LogEmailProvider.prototype, "send");
    try {
      environment.NODE_ENV = "production";
      await expect(issueCustomerEmailVerification(customerId)).rejects.toBeInstanceOf(VerificationEmailDeliveryError);
      expect(send).not.toHaveBeenCalled();
      expect(await prisma.magicLink.count({ where: { customerUserId: customerId } })).toBe(before);
    } finally {
      environment.NODE_ENV = original;
    }
  });
});
