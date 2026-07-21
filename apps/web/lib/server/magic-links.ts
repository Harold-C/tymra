import { getEnvironment } from "@tymra/config";
import {
  encryptPersonalData,
  enqueueJob,
  hashOpaqueToken,
  hashPersonalIdentifier,
  issueOpaqueToken,
  prisma,
  type Prisma,
} from "@tymra/db";
import { stayQuerySchema, unlockRoughResultSchema } from "@tymra/domain";
import { buildServiceEmail, LogEmailProvider, SmtpEmailProvider, type EmailProvider } from "@tymra/providers";

import { issueCustomerSessionToken } from "./customer-auth";

export class InvalidMagicLinkError extends Error {
  constructor() {
    super("This verification link is invalid or has expired.");
    this.name = "InvalidMagicLinkError";
  }
}

export async function requestMagicLink(
  anonymousCheckId: string,
  inputValue: unknown,
  requestIdentity: { ipAddress: string },
) {
  const input = unlockRoughResultSchema.parse(inputValue);
  const environment = getEnvironment();
  const check = await prisma.anonymousCheck.findUnique({ where: { id: anonymousCheckId } });
  if (!check || check.status !== "ROUGH_READY" || check.expiresAt <= new Date()) {
    throw new InvalidMagicLinkError();
  }

  const existingRequest = await prisma.magicLink.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingRequest) return neutralMagicLinkResponse(environment.MAGIC_LINK_TTL_MINUTES);

  const emailHash = hashPersonalIdentifier(input.email, environment.ACCESS_KEY_SECRET);
  const ipHash = hashPersonalIdentifier(requestIdentity.ipAddress, environment.ACCESS_KEY_SECRET);
  const minuteAgo = new Date(Date.now() - 60_000);
  const hourAgo = new Date(Date.now() - 3_600_000);
  const [recentEmail, hourlyEmail, hourlyIp] = await Promise.all([
    prisma.usageLedger.count({ where: { action: "MAGIC_LINK", subjectType: "EMAIL", subjectHash: emailHash, createdAt: { gte: minuteAgo } } }),
    prisma.usageLedger.count({ where: { action: "MAGIC_LINK", subjectType: "EMAIL", subjectHash: emailHash, createdAt: { gte: hourAgo } } }),
    prisma.usageLedger.count({ where: { action: "MAGIC_LINK", subjectType: "IP", subjectHash: ipHash, createdAt: { gte: hourAgo } } }),
  ]);
  const limited = recentEmail >= 1 || hourlyEmail >= 3 || hourlyIp >= 10;
  await prisma.abuseDecision.create({
    data: {
      action: "MAGIC_LINK",
      subjectHash: emailHash,
      outcome: limited ? "COOLDOWN" : "ALLOW",
      reasonCodes: limited ? ["MAGIC_LINK_COOLDOWN"] : [],
      anonymousCheckId,
      cooldownUntil: limited ? new Date(Date.now() + 60_000) : null,
    },
  });
  if (limited) return neutralMagicLinkResponse(environment.MAGIC_LINK_TTL_MINUTES);

  const issued = issueOpaqueToken(environment.SESSION_SECRET);
  const encryptedEmail = encryptPersonalData(input.email, environment.DATA_ENCRYPTION_KEY);
  const customer = await prisma.customerUser.findUnique({ where: { emailHash }, select: { id: true } });
  const magicLink = await prisma.magicLink.create({
    data: {
      tokenHash: issued.tokenHash,
      idempotencyKey: input.idempotencyKey,
      emailHash,
      encryptedEmail,
      locale: check.locale,
      anonymousCheckId,
      customerUserId: customer?.id,
      marketingConsent: input.marketingConsent,
      expiresAt: new Date(Date.now() + environment.MAGIC_LINK_TTL_MINUTES * 60_000),
    },
  });

  const delivery = await prisma.emailDelivery.create({
    data: {
      type: "VERIFY_AND_SIGN_IN",
      locale: check.locale,
      recipientHash: emailHash,
      encryptedRecipient: encryptedEmail,
      provider: "pending",
      idempotencyKey: `${magicLink.id}:verify-and-sign-in`,
    },
  });
  const safeActionUrl = `${environment.PUBLIC_ORIGIN}/${check.locale === "zh" ? "zh" : "en"}/auth/verify?token=${encodeURIComponent(issued.token)}`;
  const provider: EmailProvider = environment.EMAIL_PROVIDER === "smtp" && environment.SMTP_URL
    ? new SmtpEmailProvider(environment.SMTP_URL)
    : new LogEmailProvider();
  const message = buildServiceEmail({
    type: "VERIFY_AND_SIGN_IN",
    locale: check.locale === "zh" ? "zh" : "en",
    recipient: input.email,
    recipientHash: emailHash,
    from: environment.EMAIL_FROM,
    safeActionUrl,
    referenceId: magicLink.id,
  });

  await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENDING", attemptCount: { increment: 1 } } });
  try {
    const result = await provider.send(message);
    if (!result.accepted) throw new Error("The email provider did not accept the verification message.");
    await prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "SENT", provider: environment.EMAIL_PROVIDER, sentAt: new Date() } });
  } catch (error) {
    await prisma.$transaction([
      prisma.emailDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: error instanceof Error ? error.message.slice(0, 1_000) : "Email delivery failed" } }),
      prisma.magicLink.update({ where: { id: magicLink.id }, data: { status: "REVOKED", revokedAt: new Date() } }),
    ]);
    throw error;
  }

  await prisma.usageLedger.createMany({
    data: [
      { action: "MAGIC_LINK", subjectType: "EMAIL", subjectHash: emailHash, anonymousCheckId, metadata: {} },
      { action: "MAGIC_LINK", subjectType: "IP", subjectHash: ipHash, anonymousCheckId, metadata: {} },
    ],
  });
  return neutralMagicLinkResponse(environment.MAGIC_LINK_TTL_MINUTES);
}

export async function consumeMagicLink(rawToken: string) {
  const environment = getEnvironment();
  const tokenHash = hashOpaqueToken(rawToken, environment.SESSION_SECRET);
  const magicLink = await prisma.magicLink.findUnique({
    where: { tokenHash },
    include: { anonymousCheck: true },
  });
  if (!magicLink || magicLink.status !== "PENDING" || magicLink.revokedAt || magicLink.expiresAt <= new Date()) {
    throw new InvalidMagicLinkError();
  }

  const session = issueCustomerSessionToken();
  const sessionExpiresAt = new Date(Date.now() + environment.CUSTOMER_SESSION_TTL_DAYS * 86_400_000);
  const existingCustomer = await prisma.customerUser.findUnique({ where: { emailHash: magicLink.emailHash } });
  const customerId = existingCustomer?.id;
  const [allChecks, checks24h, checks30d] = customerId
    ? await Promise.all([
        prisma.priceCheck.count({ where: { customerUserId: customerId } }),
        prisma.priceCheck.count({ where: { customerUserId: customerId, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
        prisma.priceCheck.count({ where: { customerUserId: customerId, createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
      ])
    : [0, 0, 0];
  const quotaReached = allChecks > 0 && (checks24h >= 1 || checks30d >= 5);
  const existingCheck = await prisma.priceCheck.findUnique({ where: { anonymousCheckId: magicLink.anonymousCheckId } });
  const context = parsePricingContext(magicLink.anonymousCheck.pricingContext);

  const outcome = await prisma.$transaction(async (transaction) => {
    const customer = await transaction.customerUser.upsert({
      where: { emailHash: magicLink.emailHash },
      create: {
        emailHash: magicLink.emailHash,
        encryptedEmail: magicLink.encryptedEmail,
        locale: magicLink.locale,
        marketingConsent: magicLink.marketingConsent,
      },
      update: {
        encryptedEmail: magicLink.encryptedEmail,
        locale: magicLink.locale,
        marketingConsent: magicLink.marketingConsent ? true : undefined,
        status: "ACTIVE",
      },
    });

    let priceCheck = existingCheck;
    if (!priceCheck && !quotaReached) {
      const stayQuery = await transaction.stayQuery.create({
        data: {
          checkIn: context.checkIn,
          checkOut: context.checkOut,
          adults: context.adults,
          children: context.children,
          units: context.units,
          nights: Math.max(1, Math.round((context.checkOut.getTime() - context.checkIn.getTime()) / 86_400_000)),
          currency: "NZD",
          cancellationCategory: "STANDARD",
          timezone: "Pacific/Auckland",
        },
      });
      const access = issueOpaqueToken(environment.ACCESS_KEY_SECRET);
      priceCheck = await transaction.priceCheck.create({
        data: {
          rawInput: `${magicLink.anonymousCheck.platform}:${magicLink.anonymousCheck.listingId}`,
          locale: magicLink.locale,
          emailHash: magicLink.emailHash,
          encryptedEmail: magicLink.encryptedEmail,
          serviceConsent: true,
          marketingConsent: magicLink.marketingConsent,
          propertyId: magicLink.anonymousCheck.propertyId,
          unitId: magicLink.anonymousCheck.unitId,
          stayQueryId: stayQuery.id,
          marketKey: "christchurch",
          status: "QUEUED",
          accessKeyHash: access.tokenHash,
          idempotencyKey: `customer-formal:${magicLink.anonymousCheckId}`,
          rulesVersion: "BR-v1.2+R15-D025",
          isDemo: magicLink.anonymousCheck.isDemo,
          customerUserId: customer.id,
          anonymousCheckId: magicLink.anonymousCheckId,
        },
      });
    }

    await transaction.magicLink.update({
      where: { id: magicLink.id },
      data: { status: "CONSUMED", consumedAt: new Date(), customerUserId: customer.id },
    });
    await transaction.anonymousCheck.update({ where: { id: magicLink.anonymousCheckId }, data: { customerUserId: customer.id } });
    await transaction.customerSession.create({
      data: { customerUserId: customer.id, tokenHash: session.tokenHash, expiresAt: sessionExpiresAt },
    });
    return { customer, priceCheck };
  }, { isolationLevel: "Serializable" });

  if (outcome.priceCheck && !existingCheck) {
    await enqueueJob({
      type: "RATE_COLLECTION",
      payload: { priceCheckId: outcome.priceCheck.id },
      idempotencyKey: `${outcome.priceCheck.id}:rate-collection`,
      priceCheckId: outcome.priceCheck.id,
    });
    await prisma.usageLedger.create({
      data: {
        action: "FORMAL_CHECK",
        subjectType: "CUSTOMER",
        subjectHash: outcome.customer.id,
        anonymousCheckId: magicLink.anonymousCheckId,
        customerUserId: outcome.customer.id,
        metadata: { included: allChecks === 0 },
      },
    });
  }

  return {
    locale: magicLink.locale === "zh" ? "zh" as const : "en" as const,
    customerUserId: outcome.customer.id,
    priceCheckId: outcome.priceCheck?.id ?? null,
    quotaReached,
    sessionToken: session.token,
  };
}

function parsePricingContext(value: Prisma.JsonValue) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidMagicLinkError();
  const raw = value as Record<string, unknown>;
  return stayQuerySchema.parse({
    checkIn: raw.checkIn,
    checkOut: raw.checkOut,
    adults: raw.adults,
    children: raw.children,
    units: raw.units,
    currency: "NZD",
    cancellationCategory: "STANDARD",
    timezone: "Pacific/Auckland",
  });
}

function neutralMagicLinkResponse(expiresInMinutes: number) {
  return {
    accepted: true as const,
    expiresInMinutes,
    message: "If the request is eligible, a secure sign-in link has been sent.",
  };
}
