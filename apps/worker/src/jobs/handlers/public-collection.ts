import { type Environment } from "@tymra/config";
import { prisma, type Job } from "@tymra/db";
import { WorkerService } from "../../services/worker-service";
import { acknowledgePersistedArgusResults } from "../../services/argus-orchestrator";
import { DeferredJobError } from "../deferred-job";
import { publicScheduleFailureKeys } from "../../operations/schedule-policy";
import { syncIncidentSafely } from "./state";
import { JsonObject, requiredString, optionalString } from "./payload";

export async function handlePublicCollection(
  job: Job,
  environment: Environment,
  payload: JsonObject,
  options: { from?: Date; to?: Date; phase?: "discovery" | "details" | "full"; maxPages?: number; maxDetails?: number; limit?: number; dryRun?: boolean; localAcceptance?: boolean; developmentBootstrap?: boolean; lincolnOnly?: boolean; rollingLincoln?: boolean; boundedPublicSchedule?: boolean; productionCanary?: boolean },
) {
  try {
    const result = await new WorkerService(environment).collectSource(
      requiredString(payload, "sourceId"),
      optionalString(payload, "marketScope") ?? "new-zealand",
      undefined,
      { ...options, jobId: job.id },
    );
    await syncIncidentSafely(result.runId);
    await acknowledgePersistedArgusResults(environment, job.id);
  } catch (error) {
    if (error instanceof DeferredJobError) throw error;
    const run = await prisma.collectionRun.findFirst({ where: { jobId: job.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    if (run) await syncIncidentSafely(run.id);
    try {
      await acknowledgePersistedArgusResults(environment, job.id);
    } catch (retentionError) {
      process.stderr.write(`${JSON.stringify({ service: "tymra-worker", event: "argus_failure_evidence_retention_failed", jobId: job.id, message: retentionError instanceof Error ? retentionError.message : "Unknown evidence retention failure" })}\n`);
    }
    const sourceId = optionalString(payload, "sourceId");
    const pauseKeys = publicScheduleFailureKeys(job);
    if (environment.NODE_ENV === "production" && sourceId && pauseKeys.length) {
      await prisma.$transaction([
        prisma.scheduleDefinition.updateMany({ where: { key: { in: pauseKeys } }, data: { enabled: false, nextRunAt: null } }),
        prisma.dataSource.updateMany({ where: { key: sourceId }, data: { lifecycle: "SUSPENDED", enabled: false, lastReviewedAt: new Date() } }),
      ]);
    }
    throw error;
  }
}
