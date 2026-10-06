import { getEnvironment, type Environment } from "@tymra/config";
import { enqueueJob, hashPersonalIdentifier, prisma, syncCollectionIncident } from "@tymra/db";
import { DemoProvider } from "@tymra/providers/demo";

export async function syncIncidentSafely(collectionRunId: string) {
  try {
    await syncCollectionIncident(collectionRunId);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ service: "tymra-worker", event: "collection_incident_sync_failed", collectionRunId, message: error instanceof Error ? error.message : "Unknown incident sync failure" })}\n`);
  }
}

export async function checkSourceHealth(environment: Environment) {
  if (!["demo", "fixture"].includes(environment.PROVIDER_MODE)) {
    const count = await prisma.rateObservation.count({ where: { dataSource: { key: "manual-import" } } });
    await prisma.dataSource.update({ where: { key: "manual-import" }, data: { healthStatus: count > 0 ? "HEALTHY" : "DEGRADED", lastSuccessAt: count > 0 ? new Date() : undefined } });
    return;
  }
  const provider = new DemoProvider(environment.NODE_ENV);
  const health = await provider.healthCheck({ sourceKey: "development-demo", locale: "en", correlationId: "health" });
  await prisma.dataSource.update({
    where: { key: "development-demo" },
    data: { healthStatus: health.status, lastSuccessAt: health.status === "HEALTHY" ? health.checkedAt : undefined },
  });
}

export async function setCheckStatus(priceCheckId: string, status: Parameters<typeof prisma.priceCheck.update>[0]["data"]["status"], eventType: string) {
  await prisma.$transaction([
    prisma.priceCheck.update({ where: { id: priceCheckId }, data: { status } }),
    prisma.auditEvent.create({
      data: {
        eventType,
        entityType: "PriceCheck",
        entityId: priceCheckId,
        payload: { status },
        eventHash: hashPersonalIdentifier(`${priceCheckId}:${eventType}:${status}:${Date.now()}`, getEnvironment().ACCESS_KEY_SECRET),
      },
    }),
  ]);
}

export async function enqueueNext(priceCheckId: string, type: Parameters<typeof enqueueJob>[0]["type"], suffix: string, sourceJobId: string) {
  await enqueueJob({ type, payload: { priceCheckId }, idempotencyKey: `${priceCheckId}:${suffix}:${sourceJobId}`, priceCheckId, priority: await inheritedJobPriority(sourceJobId) });
}

export async function inheritedJobPriority(sourceJobId: string) {
  return (await prisma.job.findUnique({ where: { id: sourceJobId }, select: { priority: true } }))?.priority ?? 100;
}

export async function ensureWorkerException(priceCheckId: string, type: "PROPERTY_MATCH" | "UNIT_MATCH" | "HIGH_PRIORITY_REVIEW", recommendation: string, sourceKey: string) {
  const id = `worker-exception:${priceCheckId}:${sourceKey}`;
  const allowedActions = type === "PROPERTY_MATCH"
    ? ["SELECT_PROPERTY", "MARK_INSUFFICIENT"]
    : type === "UNIT_MATCH"
      ? ["SELECT_UNIT", "MARK_INSUFFICIENT"]
      : ["REANALYSE", "LOWER_CONFIDENCE", "APPROVE_AND_PUBLISH"];
  await prisma.exceptionCase.upsert({
    where: { id },
    create: {
      id,
      priceCheckId,
      type,
      priority: type === "HIGH_PRIORITY_REVIEW" ? "P1" : "P2",
      recommendation,
      evidence: { sourceKey },
      allowedActions,
      blockingUser: type !== "HIGH_PRIORITY_REVIEW",
    },
    update: {},
  });
}
