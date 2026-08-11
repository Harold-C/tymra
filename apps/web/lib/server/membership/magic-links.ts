import { getEnvironment } from "@tymra/config";
import {
  encryptPersonalData,
  decryptPersonalData,
  hashOpaqueToken,
  hashPersonalIdentifier,
  issueOpaqueToken,
  prisma,
  recordFunnelEvent,
  type Prisma,
} from "@tymra/db";
import { nzCalendarDayDifference, stayQuerySchema, unlockRoughResultSchema } from "@tymra/domain";
import { buildServiceEmail, LogEmailProvider, SmtpEmailProvider, type EmailProvider } from "@tymra/providers";

import { issueCustomerSessionToken } from "./customer-auth";
import { ensureFreeMembership, MembershipAccessError, membershipQueuePriority, reserveSpotCheck } from "./membership";
import { padNeutralResponse } from "../security-controls";
import { bindMemberRiskContext, ensureBenefitGroup, memberQuerySignature, recordMemberAction, type MemberRequestIdentity } from "./member-risk";

export class InvalidMagicLinkError extends Error {
  constructor() {
    super("This verification link is invalid or has expired.");
    this.name = "InvalidMagicLinkError";
  }
}

export async function issueCustomerEmailVerification(customerUserId: string, localeValue?: "en" | "zh") {
  const environment = getEnvironment();
  const customer = await prisma.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
  if (customer.emailVerifiedAt) return { alreadyVerified: true as const };
  const locale = localeValue ?? (customer.locale === "zh" ? "zh" : "en");
  const issued = issueOpaqueToken(environment.SESSION_SECRET);
  const now = new Date();
  const magicLink = await prisma.$transaction(async (transaction) => {
    await transaction.magicLink.updateMany({
      where: { customerUserId, purpose: "VERIFY_CUSTOMER_EMAIL", status: "PENDING", revokedAt: null },
      data: { status: "REVOKED", revokedAt: now },
    });
    return transaction.magicLink.create({
      data: {
        tokenHash: issued.tokenHash,
        idempotencyKey: `verify-email:${customerUserId}:${now.getTime()}`,
        purpose: "VERIFY_CUSTOMER_EMAIL",
        emailHash: customer.emailHash,
        encryptedEmail: customer.encryptedEmail,
        locale,
        customerUserId,
        expiresAt: new Date(now.getTime() + environment.MAGIC_LINK_TTL_MINUTES * 60_000),
      },
    });
  });
  const delivery = await prisma.emailDelivery.create({
    data: { type: "VERIFY_AND_SIGN_IN", locale, recipientHash: customer.emailHash, encryptedRecipient: customer.encryptedEmail, provider: "pending", idempotencyKey: `${magicLink.id}:verify-email` },
  });
  const recipient = decryptPersonalData(customer.encryptedEmail, environment.DATA_ENCRYPTION_KEY);
  const provider: EmailProvider = environment.EMAIL_PROVIDER === "smtp" && environment.SMTP_URL ? new SmtpEmailProvider(environment.SMTP_URL) : new LogEmailProvider();
  const message = buildServiceEmail({ type: "VERIFY_AND_SIGN_IN", locale, recipient, recipientHash: customer.emailHash, from: environment.EMAIL_FROM, safeActionUrl: `${environment.PUBLIC_ORIGIN}/${locale}/auth/verify?token=${encodeURIComponent(issued.token)}`, referenceId: magicLink.id });
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
  return { alreadyVerified: false as const, expiresInMinutes: environment.MAGIC_LINK_TTL_MINUTES };
}

export async function requestMagicLink(
  anonymousCheckId: string,
  inputValue: unknown,
  requestIdentity: { ipAddress: string },
) {
  const responseStartedAt = Date.now();
  const input = unlockRoughResultSchema.parse(inputValue);
  const environment = getEnvironment();
  const check = await prisma.anonymousCheck.findUnique({ where: { id: anonymousCheckId } });
  if (!check || check.status !== "ROUGH_READY" || check.expiresAt <= new Date()) {
    throw new InvalidMagicLinkError();
  }

  const existingRequest = await prisma.magicLink.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingRequest) return neutralMagicLinkResponseAfter(responseStartedAt, environment.MAGIC_LINK_TTL_MINUTES, environment.NEUTRAL_RESPONSE_MIN_MS);

  const analyticsDimensions = { locale: check.locale === "zh" ? "zh" as const : "en" as const, platform: check.platform, isDemo: check.isDemo };
  await recordFunnelEvent({ name: "formal_unlock_requested", dimensions: analyticsDimensions });

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
  if (limited) return neutralMagicLinkResponseAfter(responseStartedAt, environment.MAGIC_LINK_TTL_MINUTES, environment.NEUTRAL_RESPONSE_MIN_MS);

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
  await recordFunnelEvent({ name: "verification_email_queued", dimensions: analyticsDimensions });
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
  return neutralMagicLinkResponseAfter(responseStartedAt, environment.MAGIC_LINK_TTL_MINUTES, environment.NEUTRAL_RESPONSE_MIN_MS);
}

export async function consumeMagicLink(rawToken: string, requestIdentity?: MemberRequestIdentity) {
  const environment = getEnvironment();
  const tokenHash = hashOpaqueToken(rawToken, environment.SESSION_SECRET);
  const magicLink = await prisma.magicLink.findUnique({
    where: { tokenHash },
    include: { anonymousCheck: true },
  });
  if (!magicLink || magicLink.status !== "PENDING" || magicLink.revokedAt || magicLink.expiresAt <= new Date()) {
    throw new InvalidMagicLinkError();
  }
  const verifiedLink = magicLink;
  const unlockCheck = verifiedLink.anonymousCheck;
  if (verifiedLink.purpose === "UNLOCK_FORMAL_CHECK" && !unlockCheck) throw new InvalidMagicLinkError();
  if (verifiedLink.purpose === "VERIFY_CUSTOMER_EMAIL" && unlockCheck) throw new InvalidMagicLinkError();

  const session = issueCustomerSessionToken();
  const sessionExpiresAt = new Date(Date.now() + environment.CUSTOMER_SESSION_TTL_DAYS * 86_400_000);
  const context = unlockCheck ? parsePricingContext(unlockCheck.pricingContext) : null;
  const consumedAt = new Date();

  let outcome: Awaited<ReturnType<typeof activateCustomer>> | undefined;
  for (let attempt = 0; attempt < 2 && !outcome; attempt += 1) {
    try {
      outcome = await prisma.$transaction((transaction) => activateCustomer(transaction), { isolationLevel: "Serializable" });
    } catch (error) {
      if (isSerializableConflict(error) && attempt === 0) continue;
      if (error instanceof InvalidMagicLinkError || isConcurrentConsumeError(error)) throw new InvalidMagicLinkError();
      throw error;
    }
  }
  if (!outcome) throw new InvalidMagicLinkError();

  async function activateCustomer(transaction: Prisma.TransactionClient) {
    const claim = await transaction.magicLink.updateMany({
      where: {
        id: verifiedLink.id,
        status: "PENDING",
        revokedAt: null,
        expiresAt: { gt: consumedAt },
      },
      data: { status: "CONSUMED", consumedAt },
    });
    if (claim.count !== 1) throw new InvalidMagicLinkError();

    const customer = await transaction.customerUser.upsert({
      where: { emailHash: verifiedLink.emailHash },
      create: {
        emailHash: verifiedLink.emailHash,
        encryptedEmail: verifiedLink.encryptedEmail,
        locale: verifiedLink.locale,
        marketingConsent: verifiedLink.marketingConsent,
      },
      update: {
        encryptedEmail: verifiedLink.encryptedEmail,
        locale: verifiedLink.locale,
        marketingConsent: unlockCheck && verifiedLink.marketingConsent ? true : undefined,
        status: "ACTIVE",
        emailVerifiedAt: consumedAt,
      },
    });
    if (!customer.emailVerifiedAt) await transaction.customerUser.update({ where: { id: customer.id }, data: { emailVerifiedAt: consumedAt } });
    await ensureBenefitGroup(transaction, customer.id, consumedAt);
    await ensureFreeMembership(transaction, customer.id, consumedAt);
    const riskBinding = unlockCheck?.propertyId && requestIdentity
      ? await bindMemberRiskContext(transaction, { customerUserId: customer.id, propertyId: unlockCheck.propertyId, querySignature: memberQuerySignature(unlockCheck.pricingContext), identity: requestIdentity, now: consumedAt })
      : null;

    const existingCheck = unlockCheck
      ? await transaction.priceCheck.findUnique({ where: { anonymousCheckId: unlockCheck.id } })
      : null;
    let quotaReached = false;
    let blockReason: MembershipAccessError["code"] | null = null;
    let reservation: Awaited<ReturnType<typeof reserveSpotCheck>> | null = null;
    if (unlockCheck && !existingCheck) {
      try {
        reservation = await reserveSpotCheck(transaction, {
          customerUserId: customer.id,
          sellableUnitId: unlockCheck.unitId,
          idempotencyKey: `formal-check:${unlockCheck.id}`,
          now: consumedAt,
        });
      } catch (error) {
        if (!(error instanceof MembershipAccessError)) throw error;
        quotaReached = error.code === "SPOT_CHECK_QUOTA_REACHED";
        blockReason = error.code;
      }
    }
    let priceCheck = existingCheck;
    let createdPriceCheck = false;
    if (unlockCheck && context && !priceCheck && reservation) {
      const stayQuery = await transaction.stayQuery.create({
        data: {
          checkIn: context.checkIn,
          checkOut: context.checkOut,
          adults: context.adults,
          children: context.children,
          units: context.units,
          nights: Math.max(1, nzCalendarDayDifference(context.checkOut, context.checkIn)),
          currency: "NZD",
          cancellationCategory: "STANDARD",
          timezone: "Pacific/Auckland",
        },
      });
      const access = issueOpaqueToken(environment.ACCESS_KEY_SECRET);
      priceCheck = await transaction.priceCheck.create({
        data: {
          rawInput: `${unlockCheck.platform}:${unlockCheck.listingId}`,
          locale: verifiedLink.locale,
          emailHash: verifiedLink.emailHash,
          encryptedEmail: verifiedLink.encryptedEmail,
          serviceConsent: true,
          marketingConsent: verifiedLink.marketingConsent,
          propertyId: unlockCheck.propertyId,
          unitId: unlockCheck.unitId,
          stayQueryId: stayQuery.id,
          marketKey: "christchurch",
          status: "QUEUED",
          accessKeyHash: access.tokenHash,
          idempotencyKey: `customer-formal:${unlockCheck.id}`,
          rulesVersion: "BR-v1.2+R15-D025",
          isDemo: unlockCheck.isDemo,
          customerUserId: customer.id,
          anonymousCheckId: unlockCheck.id,
        },
      });
      await transaction.membershipUsage.update({ where: { id: reservation.usage.id }, data: { priceCheckId: priceCheck.id } });
      if (riskBinding && requestIdentity && unlockCheck.propertyId) await recordMemberAction(transaction, { customerUserId: customer.id, benefitGroupId: riskBinding.benefitGroupId, priceCheckId: priceCheck.id, propertyId: unlockCheck.propertyId, querySignature: memberQuerySignature(unlockCheck.pricingContext), identity: requestIdentity });
      await transaction.job.create({
        data: {
          type: "RATE_COLLECTION",
          status: "PENDING",
          payload: { priceCheckId: priceCheck.id },
          idempotencyKey: `${priceCheck.id}:rate-collection`,
          priceCheckId: priceCheck.id,
          queueName: "rate-collection",
          priority: membershipQueuePriority(reservation.membership.plan),
          runAt: environment.NODE_ENV === "test" ? new Date(consumedAt.getTime() + 3_600_000) : consumedAt,
        },
      });
      createdPriceCheck = true;
    }

    await transaction.magicLink.update({
      where: { id: verifiedLink.id },
      data: { customerUserId: customer.id },
    });
    if (unlockCheck) await transaction.anonymousCheck.update({ where: { id: unlockCheck.id }, data: { customerUserId: customer.id } });
    await transaction.customerSession.updateMany({
      where: { customerUserId: customer.id, revokedAt: null, expiresAt: { gt: consumedAt } },
      data: { revokedAt: consumedAt },
    });
    await transaction.customerSession.create({
      data: { customerUserId: customer.id, tokenHash: session.tokenHash, expiresAt: sessionExpiresAt },
    });
    return { customer, priceCheck, quotaReached, blockReason, reservation, createdPriceCheck };
  }

  const analyticsDimensions = unlockCheck ? {
    locale: verifiedLink.locale === "zh" ? "zh" as const : "en" as const,
    platform: unlockCheck.platform,
    isDemo: unlockCheck.isDemo,
  } : null;
  if (analyticsDimensions) {
    await recordFunnelEvent({ name: "verification_completed", dimensions: analyticsDimensions });
    await recordFunnelEvent({ name: "customer_session_created", dimensions: analyticsDimensions });
    if (outcome.blockReason) await recordFunnelEvent({ name: "quota_reached", dimensions: { ...analyticsDimensions, reasonCode: outcome.blockReason } });
  }

  if (unlockCheck && analyticsDimensions && outcome.priceCheck && outcome.createdPriceCheck) {
    await prisma.usageLedger.create({
      data: {
        action: "FORMAL_CHECK",
        subjectType: "CUSTOMER",
        subjectHash: outcome.customer.id,
        anonymousCheckId: unlockCheck.id,
        customerUserId: outcome.customer.id,
        metadata: { included: outcome.reservation?.usage.type === "INITIAL_REPORT", plan: outcome.reservation?.membership.plan },
      },
    });
    await recordFunnelEvent({ name: "formal_check_queued", dimensions: analyticsDimensions });
  }

  return {
    locale: verifiedLink.locale === "zh" ? "zh" as const : "en" as const,
    customerUserId: outcome.customer.id,
    priceCheckId: outcome.priceCheck?.id ?? null,
    quotaReached: outcome.quotaReached,
    blockReason: outcome.blockReason,
    purpose: verifiedLink.purpose,
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

async function neutralMagicLinkResponseAfter(startedAt: number, expiresInMinutes: number, minimumMs: number) {
  await padNeutralResponse(startedAt, minimumMs);
  return neutralMagicLinkResponse(expiresInMinutes);
}

function isConcurrentConsumeError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    && (error.code === "P2002" || error.code === "P2034");
}

function isSerializableConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2034";
}
