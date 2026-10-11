import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma, type Prisma } from "@tymra/db";
import { entitlementsForMembership, memberReviewRange, memberStrategySchema, membershipIsServiceable } from "@tymra/domain";
import { z } from "zod";
import { membershipFeatureLaunchAvailability } from "./stripe-billing";
import { membershipHistoryCutoff, runMembershipTransaction } from "./membership";

export class MemberFeatureError extends Error {
  constructor(readonly code: "PLAN_REQUIRED" | "FEATURE_NOT_LAUNCHED" | "NOT_FOUND" | "CONFLICT" | "MEMBERSHIP_INACTIVE", message: string) { super(message); }
}
const object = (value: unknown) => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export async function requireMemberFeature(customerUserId: string, feature: "portfolio" | "alerts", tx: Prisma.TransactionClient = prisma) {
  const membership = await tx.membershipSubscription.findUnique({ where: { customerUserId }, include: { customerUser: true } });
  if (!membership || (feature === "portfolio" ? !entitlementsForMembership(membership).portfolioView : membership.plan === "FREE")) throw new MemberFeatureError("PLAN_REQUIRED", feature === "portfolio" ? "Pro or Portfolio required." : "Host or higher required.");
  if (!membershipFeatureLaunchAvailability()[feature]) throw new MemberFeatureError("FEATURE_NOT_LAUNCHED", "This feature has not passed the launch gate.");
  if (membership.customerUser.status !== "ACTIVE" || !membership.customerUser.emailVerifiedAt || !membershipIsServiceable(membership.status, membership.graceEndsAt, new Date(), membership.plan === "FREE" ? null : membership.currentPeriodEnd)) throw new MemberFeatureError("MEMBERSHIP_INACTIVE", "An active, verified membership is required.");
  return membership;
}

export async function getMemberPortfolio(customerUserId: string) {
  const membership = await requireMemberFeature(customerUserId, "portfolio");
  const units = await prisma.customerPricingUnit.findMany({ where: { customerUserId }, include: { sellableUnit: { include: { property: { select: { canonicalName: true } } } } }, orderBy: { createdAt: "asc" } });
  const checks = await prisma.priceCheck.findMany({ where: { customerUserId, unitId: { in: units.map(unit => unit.sellableUnitId) }, createdAt: { gte: membershipHistoryCutoff(membership) } }, orderBy: { createdAt: "desc" }, distinct: ["unitId"], include: { resultVersions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1, include: { insights: { take: 1, orderBy: { stayDate: "asc" } } } } } });
  const candidates = await prisma.rateObservation.findMany({ where: { quarantine: null, collectionRun: { priceCheck: { customerUserId } }, sellableUnitId: { notIn: units.map(unit => unit.sellableUnitId) } }, distinct: ["sellableUnitId"], take: 100, select: { sellableUnitId: true, sellableUnit: { select: { officialName: true } } } });
  return { plan: membership.plan, canBulk: membership.plan === "PORTFOLIO", candidates: candidates.map(item => ({ id: item.sellableUnitId, name: item.sellableUnit.officialName })), units: units.map(unit => {
    const check = checks.find(check => check.unitId === unit.sellableUnitId); const result = check?.resultVersions[0]; const insight = result?.insights[0];
    const strategy = memberStrategySchema.parse(unit.strategy);
    const comparable = result?.recommendationStatus === "COMPLETED" && insight?.targetPriceMinor && insight.competitorMedianMinor;
    const gapPercent = comparable ? Math.round((insight!.competitorMedianMinor! / insight!.targetPriceMinor! - 1) * 1000) / 10 : null;
    return { id: unit.id, name: unit.sellableUnit.officialName, propertyName: unit.sellableUnit.property.canonicalName, active: unit.active, groupName: unit.groupName, strategyVersion: unit.strategyVersion, strategy, checkId: check?.id ?? null, status: check?.status ?? "NO_CHECK", asOf: result?.dataLastCheckedAt ?? null, confidence: result?.confidence ?? null, gapPercent,
      reviewRange: comparable ? memberReviewRange(strategy, insight!.targetPriceMinor, insight!.competitorMedianMinor, result!.confidence) : null };
  }).sort((a, b) => (b.gapPercent ?? -Infinity) - (a.gapPercent ?? -Infinity)) };
}

const changeSchema = z.object({
  units: z.array(z.object({ id: z.string().min(1), version: z.number().int().positive() })).min(1).max(200),
  patch: z.object({ groupName: z.string().trim().max(60).nullable().optional(), strategy: memberStrategySchema.optional() }).strict().refine(value => Object.keys(value).length > 0),
});

export async function previewMemberStrategy(customerUserId: string, value: unknown) {
  const membership = await requireMemberFeature(customerUserId, "portfolio");
  const input = changeSchema.parse(value);
  if (new Set(input.units.map(unit => unit.id)).size !== input.units.length) throw new MemberFeatureError("CONFLICT", "Select each monitored object only once.");
  if (membership.plan !== "PORTFOLIO" && (input.units.length > 1 || input.patch.groupName !== undefined)) throw new MemberFeatureError("PLAN_REQUIRED", "Grouping and bulk changes require Portfolio.");
  const units = await prisma.customerPricingUnit.findMany({ where: { customerUserId, id: { in: input.units.map(unit => unit.id) } } });
  if (units.length !== input.units.length) throw new MemberFeatureError("NOT_FOUND", "A monitored object was not found.");
  if (units.some(unit => input.units.find(item => item.id === unit.id)!.version !== unit.strategyVersion)) throw new MemberFeatureError("CONFLICT", "Settings changed. Refresh before previewing.");
  const comparableIds = [...(input.patch.strategy?.excludedComparableUnitIds ?? []), ...(input.patch.strategy?.pinnedComparableUnitIds ?? [])];
  if (comparableIds.length) {
    const available = await prisma.rateObservation.findMany({ where: { quarantine: null, collectionRun: { priceCheck: { customerUserId } }, sellableUnitId: { in: comparableIds } }, distinct: ["sellableUnitId"], select: { sellableUnitId: true } });
    if (comparableIds.some(id => !available.some(row => row.sellableUnitId === id)) || units.some(unit => comparableIds.includes(unit.sellableUnitId))) throw new MemberFeatureError("NOT_FOUND", "Only observed comparable objects can be selected; a target cannot exclude itself.");
  }
  const expiresAt = Date.now() + 600000;
  const body = Buffer.from(JSON.stringify({ customerUserId, input, expiresAt })).toString("base64url");
  return { affectedCount: units.length, patch: input.patch, expiresAt, previewToken: `${body}.${sign(body)}` };
}

export async function applyMemberStrategy(customerUserId: string, token: string, idempotencyKey: string) {
  if (!idempotencyKey || idempotencyKey.length > 128) throw new MemberFeatureError("CONFLICT", "An idempotency key is required.");
  let quote: { customerUserId: string; input: z.infer<typeof changeSchema>; expiresAt: number };
  try { const [body, signature, extra] = token.split("."); const expected = Buffer.from(sign(body)); const actual = Buffer.from(signature ?? ""); if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error(); quote = JSON.parse(Buffer.from(body, "base64url").toString()); if (quote.customerUserId !== customerUserId) throw new Error(); quote.input = changeSchema.parse(quote.input); }
  catch { throw new MemberFeatureError("CONFLICT", "The preview is invalid. Preview the change again."); }
  return runMembershipTransaction(async tx => {
    const membership = await requireMemberFeature(customerUserId, "portfolio", tx);
    const key = `MEMBER_STRATEGY_CHANGE:${customerUserId}:${idempotencyKey}`;
    const replay = await tx.usageLedger.findUnique({ where: { operationKey: key } });
    if (replay) { if (object(replay.metadata).previewSignature !== sign(token)) throw new MemberFeatureError("CONFLICT", "This request key was already used."); return { affectedCount: quote.input.units.length, idempotent: true }; }
    if (quote.expiresAt < Date.now()) throw new MemberFeatureError("CONFLICT", "The preview expired. Preview the change again.");
    if (membership.plan !== "PORTFOLIO" && (quote.input.units.length > 1 || quote.input.patch.groupName !== undefined)) throw new MemberFeatureError("PLAN_REQUIRED", "Portfolio required for this change.");
    for (const unit of quote.input.units) {
      const update = await tx.customerPricingUnit.updateMany({ where: { id: unit.id, customerUserId, strategyVersion: unit.version }, data: { ...quote.input.patch, strategyVersion: { increment: 1 } } });
      if (update.count !== 1) throw new MemberFeatureError("CONFLICT", "A monitored object's settings changed. Nothing was applied; preview again.");
    }
    await tx.usageLedger.create({ data: { operationKey: key, customerUserId, action: "MEMBER_STRATEGY_CHANGE", subjectType: "ACCOUNT", subjectHash: customerUserId, metadata: { ...quote.input, previewSignature: sign(token) } as Prisma.InputJsonValue } });
    return { affectedCount: quote.input.units.length, idempotent: false };
  });
}
function sign(value: string) { return createHmac("sha256", getEnvironment().ACCESS_KEY_SECRET).update(`member-strategy:${value}`).digest("base64url"); }

export async function getMemberAlerts(customerUserId: string) {
  const membership = await requireMemberFeature(customerUserId, "alerts");
  const [alerts, units] = await Promise.all([
    prisma.usageLedger.findMany({ where: { customerUserId, action: "MEMBER_ALERT", createdAt: { gte: membershipHistoryCutoff(membership) } }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, priceCheckId: true, createdAt: true, metadata: true } }),
    prisma.customerPricingUnit.findMany({ where: { customerUserId }, select: { id: true, strategyVersion: true, strategy: true, sellableUnit: { select: { officialName: true } } } }),
  ]);
  return { alerts, units: units.map(unit => ({ id: unit.id, name: unit.sellableUnit.officialName, version: unit.strategyVersion, emailAlerts: memberStrategySchema.parse(unit.strategy).emailAlerts })) };
}

export async function updateMemberAlert(customerUserId: string, value: unknown) {
  const input = z.union([z.object({ alertId: z.string(), acknowledged: z.literal(true) }), z.object({ unitId: z.string(), version: z.number().int(), emailAlerts: z.boolean() })]).parse(value);
  return runMembershipTransaction(async tx => {
    await requireMemberFeature(customerUserId, "alerts", tx);
    if ("alertId" in input) {
      const alert = await tx.usageLedger.findFirst({ where: { id: input.alertId, customerUserId, action: "MEMBER_ALERT" } });
      if (!alert) throw new MemberFeatureError("NOT_FOUND", "Alert not found.");
      await tx.usageLedger.update({ where: { id: alert.id }, data: { metadata: { ...object(alert.metadata), acknowledged: true } as Prisma.InputJsonValue } });
    } else {
      const unit = await tx.customerPricingUnit.findFirst({ where: { id: input.unitId, customerUserId } });
      if (!unit) throw new MemberFeatureError("NOT_FOUND", "Monitored object not found.");
      if (unit.strategyVersion !== input.version) throw new MemberFeatureError("CONFLICT", "Settings changed. Refresh and try again.");
      await tx.customerPricingUnit.update({ where: { id: unit.id }, data: { strategy: { ...memberStrategySchema.parse(unit.strategy), emailAlerts: input.emailAlerts }, strategyVersion: { increment: 1 } } });
      await tx.usageLedger.create({ data: { customerUserId, action: "MEMBER_ALERT_PREFERENCE", subjectType: "ACCOUNT", subjectHash: customerUserId, metadata: input } });
    }
    return { saved: true };
  });
}
