import { getEnvironment } from "@tymra/config";
import { decryptPersonalData, prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";

const settingsSchema = z.object({
  locale: z.enum(["en", "zh"]),
  marketingConsent: z.boolean(),
});

const requestSchema = z.object({
  type: z.enum(["EXPORT", "DELETE"]),
  reason: z.string().trim().max(1_000).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const customer = await prisma.customerUser.findUniqueOrThrow({
      where: { id: session.customerUserId },
      include: { dataRequests: { orderBy: { requestedAt: "desc" }, take: 10 } },
    });
    return apiSuccess({
      email: decryptPersonalData(customer.encryptedEmail, getEnvironment().DATA_ENCRYPTION_KEY),
      locale: customer.locale,
      marketingConsent: customer.marketingConsent,
      hasPassword: Boolean(customer.passwordHash),
      emailVerified: Boolean(customer.emailVerifiedAt),
      benefitGroupId: customer.benefitGroupId,
      dataRequests: customer.dataRequests,
    });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}

export async function PATCH(request: NextRequest) {
  if (!isCustomerSameOrigin(request)) return apiError(403, "FORBIDDEN", "The request origin is not allowed.");
  try {
    const session = await requireCustomerSession(request);
    const input = settingsSchema.parse(await request.json());
    const updated = await prisma.customerUser.update({ where: { id: session.customerUserId }, data: input, select: { locale: true, marketingConsent: true } });
    return apiSuccess(updated);
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isCustomerSameOrigin(request)) return apiError(403, "FORBIDDEN", "The request origin is not allowed.");
  try {
    const session = await requireCustomerSession(request);
    const input = requestSchema.parse(await request.json());
    const existing = await prisma.customerDataRequest.findFirst({ where: { customerUserId: session.customerUserId, type: input.type, status: { in: ["PENDING", "IN_PROGRESS"] } } });
    if (existing) return apiSuccess(existing);
    return apiSuccess(await prisma.customerDataRequest.create({ data: { customerUserId: session.customerUserId, ...input } }), { status: 201 });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    return apiException(error);
  }
}
