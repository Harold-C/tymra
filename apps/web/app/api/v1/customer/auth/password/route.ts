import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, prisma } from "@tymra/db";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { createCustomerSession, CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession, setCustomerSessionCookie } from "@/lib/server/membership/customer-auth";
import { consumeRateLimit } from "@/lib/server/rate-limit";
import { memberRequestIdentity, setMemberDeviceCookie } from "@/lib/server/membership/member-risk";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(200),
  returnTo: z.string().max(500).regex(/^\/(en|zh)\/account(?:[/?]|$)/).optional(),
});

const dummyPasswordHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5LMLx/uGLA4wcja6rNmmyn28/MK5n9e";
const changeSchema = z.object({ currentPassword: z.string().max(200).optional(), newPassword: z.string().min(12).max(200) });

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const rateLimit = consumeRateLimit(request, "customer-password-sign-in", 10, 15 * 60_000);
    if (!rateLimit.allowed) return apiError(429, "RATE_LIMITED", "Too many sign-in attempts. Please try again later.", { headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
    const input = schema.parse(await request.json());
    const emailHash = hashPersonalIdentifier(input.email, getEnvironment().ACCESS_KEY_SECRET);
    const customer = await prisma.customerUser.findUnique({ where: { emailHash } });
    const validPassword = await bcrypt.compare(input.password, customer?.passwordHash ?? dummyPasswordHash);
    if (!customer || customer.status !== "ACTIVE" || !customer.passwordHash || !validPassword) {
      return apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const identity = memberRequestIdentity(request);
    const session = await createCustomerSession(customer.id, false, identity);
    const response = apiSuccess({ customer: { id: customer.id }, returnTo: input.returnTo ?? `/${customer.locale === "zh" ? "zh" : "en"}/account` }, { status: 201 });
    setCustomerSessionCookie(response, session.token);
    setMemberDeviceCookie(response, identity);
    return response;
  } catch (error) {
    return apiException(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const input = changeSchema.parse(await request.json());
    const customer = await prisma.customerUser.findUniqueOrThrow({ where: { id: session.customerUserId } });
    if (customer.passwordHash && (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, customer.passwordHash)))) {
      return apiError(401, "CURRENT_PASSWORD_INCORRECT", "The current password is incorrect.");
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    const now = new Date();
    await prisma.$transaction([
      prisma.customerUser.update({ where: { id: customer.id }, data: { passwordHash, passwordChangedAt: now } }),
      prisma.customerSession.updateMany({ where: { customerUserId: customer.id, id: { not: session.id }, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    return apiSuccess({ passwordChanged: true });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
