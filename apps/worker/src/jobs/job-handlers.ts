import { type Environment } from "@tymra/config";
import { prisma, processHistoricalBackfill, type EmailType, type Job } from "@tymra/db";
import { WorkerService } from "../services/worker-service";
import { enqueueDueMembershipAnalyses } from "../membership/scheduler";
import { acknowledgePersistedArgusResults, pollArgusExecution } from "../services/argus-orchestrator";
import { DeferredJobError } from "./deferred-job";
import { isProductionOtaPayload, pauseProductionOta } from "../operations/production-ota";
import { handlePublicCollection } from "./handlers/public-collection";
import { collectRates, normalizeRates, buildCompetitors, analyse, autoValidate, generateResult, publishResult, validatePropertyIdentification, validateUnitIdentification } from "./handlers/pricing";
import { deliverEmail, sendTerminalNotification } from "./handlers/notifications";
import { refreshMarketCoverage } from "./handlers/coverage";
import { syncIncidentSafely, checkSourceHealth, enqueueNext } from "./handlers/state";
import { asObject, requiredString, optionalString, optionalNumber, optionalBoolean, optionalDate, eventCollectionPhase } from "./handlers/payload";

export async function handleJob(job: Job, environment: Environment): Promise<void> {
  if (job.priceCheckId) {
    const check = await prisma.priceCheck.findUnique({ where: { id: job.priceCheckId }, select: { status: true, customerUser: { select: { status: true } } } });
    if (!check || ["CANCELLED", "EXPIRED", "ARCHIVED"].includes(check.status) || check.customerUser?.status === "DELETED") return;
  }
  const payload = asObject(job.payload);
  const analysisRequestId = optionalString(payload, "analysisRequestId");
  const workerService = analysisRequestId ? new WorkerService(environment) : null;
  switch (job.type) {
    case "BACKFILL_IMPORT":
      await processHistoricalBackfill(requiredString(payload, "backfillId"), job.id);
      return;
    case "MEMBERSHIP_SCHEDULE":
      await enqueueDueMembershipAnalyses();
      return;
    case "ARGUS_JOB_POLL":
      await pollArgusExecution(environment, requiredString(payload, "executionId"));
      return;
    case "RATE_COLLECTION":
      if (analysisRequestId) return void await workerService!.collectAnalysis(analysisRequestId, job.id);
      await collectRates(requiredString(payload, "priceCheckId"), job.id, environment);
      return;
    case "RATE_NORMALIZATION":
      await normalizeRates(requiredString(payload, "priceCheckId"), job.id);
      return;
    case "COMPETITOR_BUILD":
      if (analysisRequestId) return void await workerService!.buildCompetitorSet(analysisRequestId, job.id);
      await buildCompetitors(requiredString(payload, "priceCheckId"), job.id);
      return;
    case "SNAPSHOT_GENERATION":
      await new WorkerService(environment).buildSnapshots(requiredString(payload, "analysisRequestId"), job.id);
      return;
    case "PRICE_ANALYSIS":
      await new WorkerService(environment).analyseSnapshot(requiredString(payload, "analysisRequestId"), job.id);
      return;
    case "ANALYSIS":
      await analyse(requiredString(payload, "priceCheckId"), job.id);
      return;
    case "AUTO_VALIDATION":
      await autoValidate(requiredString(payload, "priceCheckId"), job.id, environment);
      return;
    case "RESULT_GENERATION":
      await generateResult(requiredString(payload, "priceCheckId"), payload, job.id);
      return;
    case "RESULT_PUBLICATION":
      await publishResult(requiredString(payload, "priceCheckId"));
      return;
    case "EMAIL_DELIVERY":
      await deliverEmail(requiredString(payload, "deliveryId"), environment);
      return;
    case "RESULT_NOTIFICATION":
      await sendTerminalNotification(
        requiredString(payload, "priceCheckId"),
        requiredString(payload, "emailType") as EmailType,
        requiredString(payload, "suffix"),
        optionalString(payload, "resultVersionId"),
      );
      return;
    case "SOURCE_HEALTH_CHECK":
      if (optionalString(payload, "sourceId")) {
        await new WorkerService(environment).sourceHealth(optionalString(payload, "sourceId"));
        return;
      }
      await checkSourceHealth(environment);
      return;
    case "EVENT_COLLECTION":
      await handlePublicCollection(job, environment, payload, {
        from: optionalDate(payload, "from"),
        to: optionalDate(payload, "to"),
        phase: eventCollectionPhase(payload),
        maxPages: optionalNumber(payload, "maxPages"),
        maxDetails: optionalNumber(payload, "maxDetails"),
        limit: optionalNumber(payload, "limit"),
        dryRun: optionalBoolean(payload, "dryRun"),
        localAcceptance: optionalBoolean(payload, "localAcceptance"),
        developmentBootstrap: optionalBoolean(payload, "developmentBootstrap"),
        boundedPublicSchedule: optionalBoolean(payload, "boundedPublicSchedule"),
        productionCanary: optionalBoolean(payload, "productionCanary"),
      });
      return;
    case "PUBLIC_DATA_COLLECTION":
    case "WEATHER_COLLECTION":
    case "TRANSPORT_COLLECTION":
      await handlePublicCollection(job, environment, payload, {
        from: optionalDate(payload, "from"),
        to: optionalDate(payload, "to"),
        limit: optionalNumber(payload, "limit"),
        dryRun: optionalBoolean(payload, "dryRun"),
        localAcceptance: optionalBoolean(payload, "localAcceptance"),
        lincolnOnly: optionalBoolean(payload, "lincolnOnly"),
        rollingLincoln: optionalBoolean(payload, "rollingLincoln"),
        boundedPublicSchedule: optionalBoolean(payload, "boundedPublicSchedule"),
        productionCanary: optionalBoolean(payload, "productionCanary"),
      });
      return;
    case "RETENTION_CLEANUP":
      await new WorkerService(environment).retentionCleanup();
      return;
    case "CATALOG_DISCOVERY":
      if (payload.productionOta !== undefined) {
        if (!isProductionOtaPayload(payload) || job.queueName !== "ota-production" || job.sourceId !== payload.sourceId || job.maxAttempts !== 1) throw new Error("Unapproved production OTA Job");
        try {
          await new WorkerService(environment).collectProductionOta(payload, job.id);
          await acknowledgePersistedArgusResults(environment, job.id);
        } catch (error) {
          if (error instanceof DeferredJobError) throw error;
          await pauseProductionOta(payload.sourceId, environment.NODE_ENV);
          const runs = await prisma.collectionRun.findMany({ where: { jobId: job.id } });
          for (const run of runs) {
            if (run.status === "RUNNING") await prisma.collectionRun.update({ where: { id: run.id }, data: { status: "FAILED", failureCount: 1, errorCode: "OTA_TRIAL_FAILED", finishedAt: new Date() } });
            await syncIncidentSafely(run.id);
          }
          try { await acknowledgePersistedArgusResults(environment, job.id); } catch { /* Preserve unacknowledged evidence for explicit recovery. */ }
          throw error;
        }
        return;
      }
      if (optionalString(payload, "priceCheckId")) {
        const priceCheckId = requiredString(payload, "priceCheckId");
        await new WorkerService(environment).discoverAndCollectPriceCheckComparables(priceCheckId, job.id);
        await acknowledgePersistedArgusResults(environment, job.id);
        await enqueueNext(priceCheckId, "RATE_NORMALIZATION", "normalize", job.id);
        return;
      }
      await new WorkerService(environment).refreshCatalog(optionalString(payload, "marketScope") ?? "new-zealand", job.id);
      await acknowledgePersistedArgusResults(environment, job.id);
      return;
    case "ANCHOR_PANEL_COLLECTION":
      await new WorkerService(environment).refreshPanel("ANCHOR", optionalString(payload, "marketScope") ?? "new-zealand", job.id);
      await acknowledgePersistedArgusResults(environment, job.id);
      return;
    case "ROTATING_PANEL_COLLECTION":
      await new WorkerService(environment).refreshPanel("ROTATING", optionalString(payload, "marketScope") ?? "new-zealand", job.id);
      await acknowledgePersistedArgusResults(environment, job.id);
      return;
    case "PROPERTY_IDENTIFICATION":
      await validatePropertyIdentification(requiredString(payload, "priceCheckId"), job.id, environment);
      return;
    case "UNIT_IDENTIFICATION":
      await validateUnitIdentification(requiredString(payload, "priceCheckId"));
      return;
    case "MARKET_COVERAGE_COLLECTION":
      await refreshMarketCoverage();
      return;
  }
}
