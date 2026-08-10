import { getEnvironment } from "@tymra/config";
import { encryptPersonalData, hashPersonalIdentifier, prisma } from "@tymra/db";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { createCustomerSession, isCustomerSameOrigin, setCustomerSessionCookie } from "@/lib/server/customer-auth";
import { ensureFreeMembership } from "@/lib/server/membership";
import { issueCustomerEmailVerification } from "@/lib/server/magic-links";
import { ensureBenefitGroup, memberRequestIdentity, setMemberDeviceCookie } from "@/lib/server/member-risk";
import { consumeRateLimit } from "@/lib/server/rate-limit";

const schema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(12).max(200),
  locale: z.enum(["en", "zh"]),
  serviceConsent: z.literal(true),
});

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const rateLimit = consumeRateLimit(request, "customer-register", 5, 60 * 60_000);
    if (!rateLimit.allowed) return apiError(429, "RATE_LIMITED", "Too many registration attempts. Please try again later.", { headers: { "retry-after": String(rateLimit.retryAfterSeconds) } });
    const input = schema.parse(await request.json());
    const environment = getEnvironment();
    const emailHash = hashPersonalIdentifier(input.email, environment.ACCESS_KEY_SECRET);
    if (await prisma.customerUser.findUnique({ where: { emailHash }, select: { id: true } })) {
      return apiError(409, "ACCOUNT_EXISTS", "An account already exists for this email.");
    }
    const passwordHash = await bcrypt.hash(input.password, 12);
    const identity = memberRequestIdentity(request);
    const now = new Date();
    const customer = await prisma.$transaction(async (transaction) => {
      const created = await transaction.customerUser.create({ data: { emailHash, encryptedEmail: encryptPersonalData(input.email, environment.DATA_ENCRYPTION_KEY), passwordHash, passwordChangedAt: now, locale: input.locale } });
      await ensureFreeMembership(transaction, created.id, now);
      const grouped = await ensureBenefitGroup(transaction, created.id, now);
      await transaction.riskIdentity.createMany({ data: [
        { benefitGroupId: grouped.benefitGroupId, customerUserId: created.id, subjectType: "DEVICE", subjectHash: identity.deviceHash, confidence: 70, reasonCodes: ["REGISTRATION_DEVICE"] },
        { benefitGroupId: grouped.benefitGroupId, customerUserId: created.id, subjectType: "IP_PREFIX", subjectHash: identity.ipPrefixHash, confidence: 20, reasonCodes: ["REGISTRATION_NETWORK"] },
      ], skipDuplicates: true });
      return created;
    });
    await issueCustomerEmailVerification(customer.id, input.locale);
    const session = await createCustomerSession(customer.id, false, identity);
    const response = apiSuccess({ customer: { id: customer.id }, returnTo: `/${input.locale}/account?verify=email`, verificationRequired: true }, { status: 201 });
    setCustomerSessionCookie(response, session.token);
    setMemberDeviceCookie(response, identity);
    return response;
  } catch (error) {
    return apiException(error);
  }
}
