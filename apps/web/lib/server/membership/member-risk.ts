import { createHash } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { hashPersonalIdentifier, issueOpaqueToken, type MembershipPlan, type Prisma } from "@tymra/db";
import { membershipEntitlements } from "@tymra/domain";
import { NextRequest, NextResponse } from "next/server";

import { createChallengeProvider, type ChallengeDescriptor } from "../security-controls";

export const memberDeviceCookie = "tymra_device";
export const MEMBER_RISK_POLICY_VERSION = "member-abuse-v1";

type Transaction = Prisma.TransactionClient;

export type MemberRequestIdentity = {
  deviceHash: string;
  ipPrefixHash: string;
  rawDeviceId: string;
  isNewDevice: boolean;
};

export class MemberRiskError extends Error {
  constructor(
    readonly code: "MEMBER_CHALLENGE_REQUIRED" | "MEMBER_COOLDOWN" | "DUPLICATE_BENEFIT" | "CONCURRENT_COLLECTION_LIMIT",
    readonly reasonCodes: string[],
    readonly challenge?: ChallengeDescriptor,
    readonly retryAfterSeconds?: number,
  ) {
    super(code === "MEMBER_CHALLENGE_REQUIRED"
      ? "An additional verification step is required."
      : code === "MEMBER_COOLDOWN"
        ? "Collection is temporarily paused for this membership."
        : code === "DUPLICATE_BENEFIT"
          ? "This introductory benefit has already been used by the linked benefit group."
          : "The membership already has the maximum number of concurrent collections.");
    this.name = "MemberRiskError";
  }
}

export function memberRequestIdentity(request: NextRequest): MemberRequestIdentity {
  const environment = getEnvironment();
  const existing = request.cookies.get(memberDeviceCookie)?.value;
  const rawDeviceId = existing ?? issueOpaqueToken(environment.SESSION_SECRET).token;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "local-unknown";
  return {
    rawDeviceId,
    isNewDevice: !existing,
    deviceHash: hashPersonalIdentifier(rawDeviceId, environment.ACCESS_KEY_SECRET),
    ipPrefixHash: hashPersonalIdentifier(ipPrefix(ip), environment.ACCESS_KEY_SECRET),
  };
}

export function setMemberDeviceCookie(response: NextResponse, identity: MemberRequestIdentity) {
  if (!identity.isNewDevice) return;
  const environment = getEnvironment();
  response.cookies.set(memberDeviceCookie, identity.rawDeviceId, {
    httpOnly: true,
    secure: environment.PUBLIC_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 180 * 86_400,
  });
}

export async function ensureBenefitGroup(transaction: Transaction, customerUserId: string, now = new Date()) {
  const customer = await transaction.customerUser.findUniqueOrThrow({ where: { id: customerUserId } });
  let benefitGroupId = customer.benefitGroupId;
  if (!benefitGroupId) {
    const priorEmailIdentity = await transaction.riskIdentity.findFirst({ where: { subjectType: "EMAIL", subjectHash: customer.emailHash }, orderBy: { lastSeenAt: "desc" } });
    benefitGroupId = priorEmailIdentity?.benefitGroupId ?? (await transaction.benefitGroup.create({ data: {} })).id;
    await transaction.customerUser.update({ where: { id: customer.id }, data: { benefitGroupId } });
  }
  const [accountIdentity, emailIdentity] = await Promise.all([
    transaction.riskIdentity.findUnique({ where: { benefitGroupId_subjectType_subjectHash_hashVersion: { benefitGroupId, subjectType: "ACCOUNT", subjectHash: customer.id, hashVersion: 1 } } }),
    transaction.riskIdentity.findUnique({ where: { benefitGroupId_subjectType_subjectHash_hashVersion: { benefitGroupId, subjectType: "EMAIL", subjectHash: customer.emailHash, hashVersion: 1 } } }),
  ]);
  if (!accountIdentity) await transaction.riskIdentity.create({ data: { benefitGroupId, customerUserId: customer.id, subjectType: "ACCOUNT", subjectHash: customer.id, confidence: 100, reasonCodes: ["ACCOUNT_OWNER"], lastSeenAt: now } });
  if (!emailIdentity) await transaction.riskIdentity.create({ data: { benefitGroupId, customerUserId: customer.id, subjectType: "EMAIL", subjectHash: customer.emailHash, confidence: 100, reasonCodes: ["EMAIL_IDENTITY"], lastSeenAt: now } });
  return { ...customer, benefitGroupId };
}

export async function bindMemberRiskContext(transaction: Transaction, input: {
  customerUserId: string;
  propertyId: string;
  otaListing?: string | null;
  querySignature: string;
  identity: MemberRequestIdentity;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  let customer = await ensureBenefitGroup(transaction, input.customerUserId, now);
  const currentGroupId = customer.benefitGroupId;
  const cutoff = new Date(now.getTime() - 180 * 86_400_000);

  // A device or payment instrument alone never merges memberships. A second strong
  // signal for the same physical property is required to share introductory benefits.
  const deviceGroups = await transaction.riskIdentity.findMany({
    where: { subjectType: "DEVICE", subjectHash: input.identity.deviceHash, lastSeenAt: { gte: cutoff }, benefitGroupId: { not: currentGroupId } },
    select: { benefitGroupId: true },
    distinct: ["benefitGroupId"],
  });
  const ownPaymentHashes = await transaction.paymentInstrumentIdentity.findMany({ where: { customerUserId: input.customerUserId, status: "ACTIVE" }, select: { fingerprintHash: true } });
  const paymentGroups = ownPaymentHashes.length ? await transaction.paymentInstrumentIdentity.findMany({ where: { fingerprintHash: { in: ownPaymentHashes.map((item) => item.fingerprintHash) }, benefitGroupId: { not: null } }, select: { benefitGroupId: true }, distinct: ["benefitGroupId"] }) : [];
  const candidateGroupIds = [...new Set([...deviceGroups.map((item) => item.benefitGroupId), ...paymentGroups.flatMap((item) => item.benefitGroupId ? [item.benefitGroupId] : [])])].filter((id) => id !== currentGroupId);
  if (candidateGroupIds.length) {
    const propertyIdentity = await transaction.riskIdentity.findFirst({
      where: { benefitGroupId: { in: candidateGroupIds }, subjectType: "PROPERTY", subjectHash: input.propertyId, lastSeenAt: { gte: cutoff } },
      orderBy: { lastSeenAt: "desc" },
    });
    if (propertyIdentity) {
      const currentClaims = await transaction.benefitClaim.count({ where: { benefitGroupId: currentGroupId, revokedAt: null } });
      if (currentClaims === 0) {
        await transaction.customerUser.update({ where: { id: input.customerUserId }, data: { benefitGroupId: propertyIdentity.benefitGroupId } });
        customer = { ...customer, benefitGroupId: propertyIdentity.benefitGroupId };
        await Promise.all([
          upsertIdentity(transaction, propertyIdentity.benefitGroupId, input.customerUserId, "ACCOUNT", customer.id, 100, ["LINKED_ACCOUNT_OWNER"], now),
          upsertIdentity(transaction, propertyIdentity.benefitGroupId, input.customerUserId, "EMAIL", customer.emailHash, 100, ["LINKED_EMAIL_IDENTITY"], now),
        ]);
      } else {
        await openRiskCase(transaction, {
          customerUserId: input.customerUserId,
          benefitGroupId: currentGroupId,
          outcome: "CHALLENGE",
          action: "BENEFIT_GROUP_LINK",
          reasonCodes: ["DEVICE_AND_PROPERTY_GROUP_CONFLICT"],
          evidence: { candidateBenefitGroupId: propertyIdentity.benefitGroupId },
        });
      }
    }
  }

  const benefitGroupId = customer.benefitGroupId;
  const property = await transaction.property.findUnique({ where: { id: input.propertyId }, select: { latitude: true, longitude: true } });
  const geoTile = property?.latitude != null && property.longitude != null ? `${property.latitude.toFixed(2)}:${property.longitude.toFixed(2)}` : null;
  await Promise.all([
    upsertIdentity(transaction, benefitGroupId, input.customerUserId, "DEVICE", input.identity.deviceHash, 70, ["FIRST_PARTY_DEVICE"], now),
    upsertIdentity(transaction, benefitGroupId, input.customerUserId, "IP_PREFIX", input.identity.ipPrefixHash, 20, ["NETWORK_SIGNAL_ONLY"], now),
    upsertIdentity(transaction, benefitGroupId, input.customerUserId, "PROPERTY", input.propertyId, 100, ["CANONICAL_PROPERTY"], now),
    upsertIdentity(transaction, benefitGroupId, input.customerUserId, "QUERY_SIGNATURE", input.querySignature, 60, ["PRICE_QUERY"], now),
    input.otaListing ? upsertIdentity(transaction, benefitGroupId, input.customerUserId, "OTA_LISTING", input.otaListing, 90, ["CANONICAL_OTA_LISTING"], now) : Promise.resolve(),
    geoTile ? upsertIdentity(transaction, benefitGroupId, input.customerUserId, "GEO_TILE", geoTile, 40, ["COARSE_LOCATION_TILE"], now) : Promise.resolve(),
  ]);
  return { benefitGroupId };
}

export async function enforceMemberRisk(transaction: Transaction, input: {
  customerUserId: string;
  benefitGroupId: string;
  propertyId: string;
  querySignature: string;
  identity: MemberRequestIdentity;
  plan: MembershipPlan;
  challengeToken?: string;
  challengeVerified?: boolean;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  const [openCooldown, deviceAccounts, devicePropertiesDay, devicePropertiesMonth, groupPropertiesMonth, queryVariantsDay, activeCollections] = await Promise.all([
    transaction.membershipRiskCase.findFirst({ where: { benefitGroupId: input.benefitGroupId, status: "OPEN", outcome: { in: ["COOLDOWN", "REJECT"] }, OR: [{ cooldownUntil: null }, { cooldownUntil: { gt: now } }] }, orderBy: { createdAt: "desc" } }),
    distinctRiskCount(transaction, "DEVICE", input.identity.deviceHash, "customerUserId", monthAgo),
    distinctLedgerMetadata(transaction, input.identity.deviceHash, "propertyId", dayAgo),
    distinctLedgerMetadata(transaction, input.identity.deviceHash, "propertyId", monthAgo),
    distinctGroupLedgerMetadata(transaction, input.benefitGroupId, "propertyId", monthAgo),
    distinctGroupLedgerMetadata(transaction, input.benefitGroupId, "querySignature", dayAgo),
    transaction.priceCheck.count({ where: { customerUserId: input.customerUserId, status: { in: ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING"] } } }),
  ]);

  const group = await transaction.benefitGroup.findUniqueOrThrow({ where: { id: input.benefitGroupId } });
  if (group.status === "LIMITED") throw new MemberRiskError("MEMBER_COOLDOWN", ["BENEFIT_GROUP_LIMITED_PENDING_REVIEW"], undefined, 86_400);
  if (openCooldown) throw new MemberRiskError(openCooldown.outcome === "REJECT" ? "DUPLICATE_BENEFIT" : "MEMBER_COOLDOWN", asStrings(openCooldown.reasonCodes), undefined, openCooldown.cooldownUntil ? Math.max(1, Math.ceil((openCooldown.cooldownUntil.getTime() - now.getTime()) / 1_000)) : 86_400);
  const concurrentLimit = input.plan === "FREE" ? 1 : input.plan === "HOST" ? 2 : input.plan === "PRO" ? 5 : 10;
  if (activeCollections >= concurrentLimit) throw new MemberRiskError("CONCURRENT_COLLECTION_LIMIT", ["CONCURRENT_PRICE_CHECK_LIMIT"], undefined, 300);

  const reasons: string[] = [];
  let outcome: "ALLOW" | "CHALLENGE" | "COOLDOWN" = "ALLOW";
  const propertySoftLimit = Math.max(3, membershipEntitlements[input.plan].activePricingUnitLimit * 2);
  if (devicePropertiesDay >= 6 || devicePropertiesMonth >= 15 || groupPropertiesMonth >= propertySoftLimit * 3 || queryVariantsDay >= 50) {
    outcome = "COOLDOWN";
    if (devicePropertiesDay >= 6) reasons.push("DEVICE_PROPERTY_ENUMERATION_24H");
    if (devicePropertiesMonth >= 15) reasons.push("DEVICE_PROPERTY_ENUMERATION_30D");
    if (groupPropertiesMonth >= propertySoftLimit * 3) reasons.push("GROUP_PROPERTY_ENUMERATION_30D");
    if (queryVariantsDay >= 50) reasons.push("QUERY_ENUMERATION_24H");
  } else if (deviceAccounts >= 3 || devicePropertiesMonth >= 8 || queryVariantsDay >= 20) {
    outcome = "CHALLENGE";
    if (deviceAccounts >= 3) reasons.push("MULTIPLE_ACCOUNTS_ON_DEVICE");
    if (devicePropertiesMonth >= 8) reasons.push("DEVICE_PROPERTY_VARIETY_HIGH");
    if (queryVariantsDay >= 20) reasons.push("QUERY_VARIETY_HIGH");
  }

  const provider = createChallengeProvider({
    mode: getEnvironment().ABUSE_CHALLENGE_MODE,
    secret: getEnvironment().SESSION_SECRET,
    verifyUrl: getEnvironment().ABUSE_CHALLENGE_VERIFY_URL,
    siteKey: getEnvironment().ABUSE_CHALLENGE_SITE_KEY,
    providerSecret: getEnvironment().ABUSE_CHALLENGE_SECRET,
  });
  if (outcome === "CHALLENGE" && provider.mode === "disabled") outcome = "ALLOW";
  if (outcome === "CHALLENGE" && input.challengeVerified) outcome = "ALLOW";
  const cooldownUntil = outcome === "COOLDOWN" ? new Date(now.getTime() + 24 * 3_600_000) : null;
  await transaction.abuseDecision.create({ data: { action: "MEMBER_PRICE_CHECK", subjectHash: input.identity.deviceHash, customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, outcome, reasonCodes: reasons, cooldownUntil, policyVersion: MEMBER_RISK_POLICY_VERSION } });
  if (outcome !== "ALLOW") {
    await openRiskCase(transaction, { customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, outcome, action: "MEMBER_PRICE_CHECK", reasonCodes: reasons, cooldownUntil, evidence: { deviceAccounts, devicePropertiesDay, devicePropertiesMonth, groupPropertiesMonth, queryVariantsDay } });
  }
  if (outcome === "COOLDOWN") throw new MemberRiskError("MEMBER_COOLDOWN", reasons, undefined, 86_400);
  if (outcome === "CHALLENGE") throw new MemberRiskError("MEMBER_CHALLENGE_REQUIRED", reasons, (await provider.issue(input.identity.deviceHash)) ?? undefined);
}

export async function verifyMemberChallenge(identity: MemberRequestIdentity, token: string | undefined) {
  if (!token) return false;
  const environment = getEnvironment();
  return createChallengeProvider({ mode: environment.ABUSE_CHALLENGE_MODE, secret: environment.SESSION_SECRET, verifyUrl: environment.ABUSE_CHALLENGE_VERIFY_URL, siteKey: environment.ABUSE_CHALLENGE_SITE_KEY, providerSecret: environment.ABUSE_CHALLENGE_SECRET })
    .verify(token, identity.deviceHash);
}

export async function recordMemberAction(transaction: Transaction, input: {
  customerUserId: string;
  benefitGroupId: string;
  priceCheckId?: string;
  propertyId: string;
  querySignature: string;
  identity: MemberRequestIdentity;
  action?: string;
}) {
  const metadata = { propertyId: input.propertyId, querySignature: input.querySignature };
  await transaction.usageLedger.createMany({ data: [
    { action: input.action ?? "MEMBER_PRICE_CHECK", subjectType: "ACCOUNT", subjectHash: input.customerUserId, customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, priceCheckId: input.priceCheckId, metadata },
    { action: input.action ?? "MEMBER_PRICE_CHECK", subjectType: "DEVICE", subjectHash: input.identity.deviceHash, customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, priceCheckId: input.priceCheckId, metadata },
    { action: input.action ?? "MEMBER_PRICE_CHECK", subjectType: "IP_PREFIX", subjectHash: input.identity.ipPrefixHash, customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, priceCheckId: input.priceCheckId, metadata },
    { action: input.action ?? "MEMBER_PRICE_CHECK", subjectType: "PROPERTY", subjectHash: input.propertyId, customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, priceCheckId: input.priceCheckId, metadata },
    { action: input.action ?? "MEMBER_PRICE_CHECK", subjectType: "QUERY_SIGNATURE", subjectHash: input.querySignature, customerUserId: input.customerUserId, benefitGroupId: input.benefitGroupId, priceCheckId: input.priceCheckId, metadata },
  ] });
}

export function memberQuerySignature(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function openRiskCase(transaction: Transaction, input: {
  customerUserId?: string;
  benefitGroupId?: string;
  outcome: "ALLOW" | "CHALLENGE" | "COOLDOWN" | "REJECT";
  action: string;
  reasonCodes: string[];
  evidence?: Prisma.InputJsonValue;
  cooldownUntil?: Date | null;
}) {
  return transaction.membershipRiskCase.create({ data: { ...input, evidence: input.evidence ?? {}, cooldownUntil: input.cooldownUntil ?? null } });
}

async function upsertIdentity(transaction: Transaction, benefitGroupId: string, customerUserId: string, subjectType: Prisma.RiskIdentityCreateInput["subjectType"], subjectHash: string, confidence: number, reasonCodes: string[], now: Date) {
  return transaction.riskIdentity.upsert({
    where: { benefitGroupId_subjectType_subjectHash_hashVersion: { benefitGroupId, subjectType, subjectHash, hashVersion: 1 } },
    create: { benefitGroupId, customerUserId, subjectType, subjectHash, confidence, reasonCodes, lastSeenAt: now },
    update: { lastSeenAt: now, confidence: { set: confidence }, customerUserId },
  });
}

async function distinctRiskCount(transaction: Transaction, subjectType: "DEVICE", subjectHash: string, field: "customerUserId", since: Date) {
  const rows = await transaction.riskIdentity.findMany({ where: { subjectType, subjectHash, lastSeenAt: { gte: since }, customerUserId: { not: null } }, select: { customerUserId: true }, distinct: [field] });
  return rows.length;
}

async function distinctLedgerMetadata(transaction: Transaction, subjectHash: string, field: string, since: Date) {
  const rows = await transaction.usageLedger.findMany({ where: { action: "MEMBER_PRICE_CHECK", subjectType: "DEVICE", subjectHash, createdAt: { gte: since } }, select: { metadata: true } });
  return new Set(rows.map((row) => metadataString(row.metadata, field)).filter(Boolean)).size;
}

async function distinctGroupLedgerMetadata(transaction: Transaction, benefitGroupId: string, field: string, since: Date) {
  const rows = await transaction.usageLedger.findMany({ where: { action: "MEMBER_PRICE_CHECK", subjectType: "ACCOUNT", benefitGroupId, createdAt: { gte: since } }, select: { metadata: true } });
  return new Set(rows.map((row) => metadataString(row.metadata, field)).filter(Boolean)).size;
}

function metadataString(value: Prisma.JsonValue, field: string) {
  return value && typeof value === "object" && !Array.isArray(value) && typeof value[field] === "string" ? value[field] : null;
}

function asStrings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function ipPrefix(value: string) {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(value)) return `${value.split(".").slice(0, 3).join(".")}.0/24`;
  if (value.includes(":")) return `${value.split(":").slice(0, 4).join(":")}::/56`;
  return "unknown";
}
