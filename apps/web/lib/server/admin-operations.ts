import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { enqueueJob, hashPersonalIdentifier, prisma, revokeResultLinks, type Prisma } from "@tymra/db";
import { exceptionActionSchema, type ExceptionAction } from "@tymra/domain";
import { z } from "zod";

const actionInputSchema = z.object({
  action: exceptionActionSchema,
  reason: z.string().trim().min(3).max(1_000),
  payload: z.record(z.unknown()).default({}),
});

export async function runExceptionAction(exceptionId: string, adminId: string, inputValue: unknown) {
  const input = actionInputSchema.parse(inputValue);
  const exception = await prisma.exceptionCase.findUniqueOrThrow({ where: { id: exceptionId }, include: { priceCheck: true } });
  const allowed = Array.isArray(exception.allowedActions) ? exception.allowedActions.map(String) : [];
  if (!allowed.includes(input.action)) throw new Error("This action is not allowed for the Exception");

  await applyAction(exception.priceCheckId, input.action, input.payload);
  const now = new Date();
  const terminalResolution = !["RECOLLECT", "REANALYSE"].includes(input.action);
  await prisma.$transaction([
    prisma.actionRecord.create({ data: { priceCheckId: exception.priceCheckId, actorType: "ADMIN", actorId: adminId, action: input.action, payload: { ...input.payload, reason: input.reason, exceptionId } } }),
    prisma.auditEvent.create({
      data: {
        actorAdminId: adminId,
        eventType: "exception_action_applied",
        entityType: "ExceptionCase",
        entityId: exceptionId,
        payload: { action: input.action, reason: input.reason, priceCheckId: exception.priceCheckId },
        eventHash: hashPersonalIdentifier(`${exceptionId}:${input.action}:${randomUUID()}`, getEnvironment().ACCESS_KEY_SECRET),
        isDemo: exception.isDemo,
      },
    }),
    prisma.exceptionCase.update({
      where: { id: exceptionId },
      data: {
        status: terminalResolution ? "RESOLVED" : "IN_PROGRESS",
        resolutionAction: input.action,
        resolutionReason: input.reason,
        resolvedAt: terminalResolution ? now : null,
      },
    }),
  ]);
  return prisma.exceptionCase.findUniqueOrThrow({ where: { id: exceptionId } });
}

async function applyAction(priceCheckId: string, action: ExceptionAction, payload: Record<string, unknown>) {
  switch (action) {
    case "ACCEPT_SUGGESTION":
      return;
    case "SELECT_PROPERTY": {
      const propertyId = requiredString(payload, "propertyId");
      await prisma.property.findUniqueOrThrow({ where: { id: propertyId } });
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { propertyId, unitId: null, status: "NEEDS_CONFIRMATION" } });
      return;
    }
    case "SELECT_UNIT": {
      const unitId = requiredString(payload, "unitId");
      const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
      const unit = await prisma.sellableUnit.findUniqueOrThrow({ where: { id: unitId } });
      if (!check.propertyId || unit.propertyId !== check.propertyId) throw new Error("Unit does not belong to the selected Property");
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { unitId, status: "NEEDS_CONFIRMATION" } });
      return;
    }
    case "EXCLUDE_COMPETITOR":
    case "CHANGE_COMPETITOR_ROLE": {
      const relationshipId = requiredString(payload, "relationshipId");
      const current = await prisma.competitorRelationship.findUniqueOrThrow({ where: { id: relationshipId } });
      const latest = await prisma.competitorRelationship.aggregate({ where: { targetUnitId: current.targetUnitId, competitorUnitId: current.competitorUnitId }, _max: { version: true } });
      const role = action === "EXCLUDE_COMPETITOR" ? "EXCLUDED" : roleValue(payload.role);
      await prisma.competitorRelationship.create({ data: { targetUnitId: current.targetUnitId, competitorUnitId: current.competitorUnitId, role, version: (latest._max.version ?? current.version) + 1, reasonCode: "ADMIN_EXCEPTION_ACTION", suggestedBy: "ADMIN", manualOverride: true, isDemo: current.isDemo } });
      return;
    }
    case "EDIT_NORMALIZED_VALUE": {
      const observationId = requiredString(payload, "observationId");
      const value = requiredPositiveInteger(payload, "effectiveNightlyTotalMinor");
      const original = await prisma.rateObservation.findUniqueOrThrow({ where: { id: observationId } });
      await prisma.rateObservation.create({
        data: {
          propertyId: original.propertyId,
          sellableUnitId: original.sellableUnitId,
          listingId: original.listingId,
          sourceListingId: original.sourceListingId,
          stayQueryId: original.stayQueryId,
          collectionProfileId: original.collectionProfileId,
          dataSourceId: original.dataSourceId,
          collectionRunId: original.collectionRunId,
          requestedAt: original.requestedAt,
          currency: original.currency,
          baseAmountMinor: Math.max(0, value - original.mandatoryFeesMinor - original.taxesMinor - original.platformFeesMinor),
          mandatoryFeesMinor: original.mandatoryFeesMinor,
          taxesMinor: original.taxesMinor,
          platformFeesMinor: original.platformFeesMinor,
          optionalFeesMinor: original.optionalFeesMinor,
          totalAmountMinor: value,
          exchangeRate: original.exchangeRate,
          nzdTotalMinor: value,
          effectiveNightlyTotalMinor: value,
          sourceUpdatedAt: original.sourceUpdatedAt,
          observedAt: new Date(),
          checkIn: original.checkIn,
          checkOut: original.checkOut,
          nights: original.nights,
          adults: original.adults,
          childrenAges: original.childrenAges as Prisma.InputJsonValue,
          units: original.units,
          localTimezone: original.localTimezone,
          roomTypeRaw: original.roomTypeRaw,
          roomTypeNormalized: original.roomTypeNormalized,
          unitConstraints: original.unitConstraints as Prisma.InputJsonValue,
          occupancyCapacity: original.occupancyCapacity,
          bedType: original.bedType,
          unitAttributesVersion: original.unitAttributesVersion,
          mealPlan: original.mealPlan,
          cancellationCategory: original.cancellationCategory,
          cancellationPolicy: original.cancellationPolicy,
          paymentTerms: original.paymentTerms,
          rateFence: original.rateFence,
          minimumStay: original.minimumStay,
          availabilityStatus: original.availabilityStatus,
          restrictionReason: original.restrictionReason,
          feeCompleteness: original.feeCompleteness,
          sourceUrl: original.sourceUrl,
          evidenceRef: `admin-correction://${original.id}`,
          collectorVersion: original.collectorVersion,
          parserVersion: original.parserVersion,
          qualityFlags: ["ADMIN_CORRECTION", `SUPERSEDES:${original.id}`],
          operationalStatus: original.operationalStatus,
          collectedAt: new Date(),
          rawDataStored: original.rawDataStored,
          idempotencyKey: `admin:${original.id}:${randomUUID()}`,
          isDemo: original.isDemo,
        },
      });
      return;
    }
    case "RECOLLECT":
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "QUEUED" } });
      await enqueueJob({ type: "RATE_COLLECTION", payload: { priceCheckId }, idempotencyKey: `${priceCheckId}:admin-recollect:${randomUUID()}`, priceCheckId });
      return;
    case "REANALYSE":
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "ANALYSING" } });
      await enqueueJob({ type: "ANALYSIS", payload: { priceCheckId }, idempotencyKey: `${priceCheckId}:admin-reanalyse:${randomUUID()}`, priceCheckId });
      return;
    case "LOWER_CONFIDENCE":
    case "MARK_PARTIAL": {
      const replacement = await replacePublishedResult(priceCheckId, inputActionReason(action), "PARTIAL", "LOW");
      if (!replacement) await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "PARTIAL" } });
      return;
    }
    case "MARK_INSUFFICIENT":
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "INSUFFICIENT_DATA" } });
      return;
    case "APPROVE_AND_PUBLISH": {
      const draft = await prisma.resultVersion.findFirst({ where: { priceCheckId, status: "DRAFT" }, orderBy: { version: "desc" } });
      if (!draft) throw new Error("No draft Result Version is available to publish");
      const current = await prisma.resultVersion.findFirst({ where: { priceCheckId, status: "PUBLISHED" }, orderBy: { version: "desc" } });
      const check = await prisma.priceCheck.findUniqueOrThrow({ where: { id: priceCheckId } });
      const delivery = await prisma.$transaction(async (transaction) => {
        if (current) await transaction.resultVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
        const published = await transaction.resultVersion.update({ where: { id: draft.id }, data: { status: "PUBLISHED", outcome: "PUBLISHED", publishedAt: new Date() } });
        await transaction.priceCheck.update({ where: { id: priceCheckId }, data: { status: "PUBLISHED", currentResultVersionNumber: draft.version } });
        return transaction.emailDelivery.create({
          data: {
            priceCheckId,
            resultVersionId: published.id,
            type: "RESULT_READY",
            locale: check.locale,
            recipientHash: check.emailHash,
            encryptedRecipient: check.encryptedEmail,
            provider: "pending",
            idempotencyKey: `${priceCheckId}:admin-result-ready:${published.version}`,
          },
        });
      });
      await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${priceCheckId}:admin-email:${draft.version}`, priceCheckId });
      return;
    }
    case "WITHDRAW_RESULT": {
      const results = await prisma.resultVersion.findMany({ where: { priceCheckId, status: "PUBLISHED" }, select: { id: true } });
      for (const result of results) {
        await revokeResultLinks(result.id, "Withdrawn by administrator");
        await prisma.resultVersion.update({ where: { id: result.id }, data: { status: "WITHDRAWN" } });
      }
      await prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status: "WITHDRAWN" } });
      return;
    }
  }
}

async function replacePublishedResult(
  priceCheckId: string,
  reason: string,
  outcome: "PARTIAL",
  confidence: "LOW",
) {
  const current = await prisma.resultVersion.findFirst({
    where: { priceCheckId, status: "PUBLISHED" },
    orderBy: { version: "desc" },
    include: { insights: true, priceCheck: true },
  });
  if (!current) return null;
  const latest = await prisma.resultVersion.aggregate({ where: { priceCheckId }, _max: { version: true } });
  const version = (latest._max.version ?? current.version) + 1;
  const payload: Prisma.InputJsonObject = {
    ...(jsonObject(current.payload) as Prisma.InputJsonObject),
    revision: { reason, supersedesVersion: current.version },
  };

  const delivery = await prisma.$transaction(async (transaction) => {
    const replacement = await transaction.resultVersion.create({
      data: {
        priceCheckId,
        version,
        status: "PUBLISHED",
        outcome,
        generatedAt: new Date(),
        publishedAt: new Date(),
        dataLastCheckedAt: current.dataLastCheckedAt,
        analysisVersion: `${current.analysisVersion}-admin-revision`,
        confidence,
        payload,
        supersedesId: current.id,
        isDemo: current.isDemo,
      },
    });
    for (const insight of current.insights) {
      await transaction.insight.create({
        data: {
          resultVersionId: replacement.id,
          stayDate: insight.stayDate,
          risk: insight.risk,
          reasonCodes: insight.reasonCodes as Prisma.InputJsonValue,
          marketSignalIds: insight.marketSignalIds as Prisma.InputJsonValue,
          targetPriceMinor: insight.targetPriceMinor,
          competitorMedianMinor: insight.competitorMedianMinor,
          competitorLowMinor: insight.competitorLowMinor,
          competitorHighMinor: insight.competitorHighMinor,
          recommendedAction: insight.recommendedAction,
          confidence,
          limitations: addRevisionLimitation(insight.limitations, reason),
          explanation: insight.explanation as Prisma.InputJsonValue,
        },
      });
    }
    await transaction.resultVersion.update({ where: { id: current.id }, data: { status: "SUPERSEDED" } });
    await transaction.priceCheck.update({ where: { id: priceCheckId }, data: { status: outcome, currentResultVersionNumber: version } });
    return transaction.emailDelivery.create({
      data: {
        priceCheckId,
        resultVersionId: replacement.id,
        type: "PARTIAL_RESULT",
        locale: current.priceCheck.locale,
        recipientHash: current.priceCheck.emailHash,
        encryptedRecipient: current.priceCheck.encryptedEmail,
        provider: "pending",
        idempotencyKey: `${priceCheckId}:admin-partial:${version}`,
      },
    });
  });
  await enqueueJob({ type: "EMAIL_DELIVERY", payload: { deliveryId: delivery.id }, idempotencyKey: `${priceCheckId}:admin-email:${version}`, priceCheckId });
  return { version };
}

function jsonObject(value: Prisma.JsonValue): Record<string, Prisma.JsonValue> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, Prisma.JsonValue> : {};
}

function addRevisionLimitation(value: Prisma.JsonValue, reason: string): Prisma.InputJsonValue {
  const items = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return [...items, `Administrator revision: ${reason}`];
}

function inputActionReason(action: "LOWER_CONFIDENCE" | "MARK_PARTIAL") {
  return action === "LOWER_CONFIDENCE" ? "Confidence lowered by administrator" : "Marked partial by administrator";
}

function requiredString(payload: Record<string, unknown>, key: string) { const value = payload[key]; if (typeof value !== "string" || !value) throw new Error(`${key} is required`); return value; }
function requiredPositiveInteger(payload: Record<string, unknown>, key: string) { const value = payload[key]; if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer`); return value; }
function roleValue(value: unknown): "CORE" | "REFERENCE" | "EXCLUDED" { if (value === "CORE" || value === "REFERENCE" || value === "EXCLUDED") return value; throw new Error("role must be CORE, REFERENCE or EXCLUDED"); }
