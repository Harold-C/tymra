import { createHash } from "node:crypto";
import type { Environment } from "@tymra/config";
import { prisma, hashOpaqueToken } from "@tymra/db";
export async function recordRuntimeHeartbeat(serviceId: "worker" | "scheduler", environment: Environment, status = "RUNNING") {
  const configuration = { provider: environment.PROVIDER_MODE, publicCollection: environment.PUBLIC_COLLECTION_MODE, scheduler: environment.SCHEDULER_ENABLED, highFrequency: environment.HIGH_FREQUENCY_SCHEDULER_ENABLED, autoPublish: environment.AUTO_PUBLISH_ENABLED, billing: environment.BILLING_ENABLED, email: environment.EMAIL_PROVIDER, retentionHours: environment.RAW_ARTIFACT_TTL_HOURS };
  const data = { processId: `${environment.WORKER_ID}:${process.pid}`, environment: environment.NODE_ENV, status, releaseVersion: process.env.TYMRA_RELEASE_VERSION ?? "UNREPORTED", sourceRevision: process.env.TYMRA_SOURCE_REVISION ?? "UNREPORTED", configurationHash: createHash("sha256").update(JSON.stringify(configuration)).digest("hex"), observedAt: new Date(), details: configuration };
  return prisma.$transaction(async tx => {
    const previous = await tx.serviceRuntimeHeartbeat.findUnique({ where: { serviceId } });
    const current = await tx.serviceRuntimeHeartbeat.upsert({ where: { serviceId }, create: { serviceId, ...data }, update: data });
    if (!previous || previous.configurationHash !== data.configurationHash || previous.sourceRevision !== data.sourceRevision || previous.releaseVersion !== data.releaseVersion) await tx.auditEvent.create({ data: { eventType: "runtime_configuration_observed", entityType: "ServiceRuntime", entityId: serviceId, payload: { environment: environment.NODE_ENV, previous: previous ? { configurationHash: previous.configurationHash, sourceRevision: previous.sourceRevision, releaseVersion: previous.releaseVersion } : null, current: { configurationHash: data.configurationHash, sourceRevision: data.sourceRevision, releaseVersion: data.releaseVersion, configuration } }, eventHash: hashOpaqueToken(`${serviceId}:${data.observedAt.toISOString()}:${data.configurationHash}`, environment.ACCESS_KEY_SECRET) } });
    return current;
  });
}
