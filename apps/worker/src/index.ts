import { getEnvironment } from "@tymra/config";
import { claimNextJob, deferClaimedJob, markJobFailed, markJobSucceeded, prisma, recoverExpiredJobs, renewJobLease } from "@tymra/db";
import { DeferredJobError } from "./jobs/deferred-job";
import { classifyJobFailure } from "./jobs/job-failure";
import { handleJob } from "./jobs/job-handlers";

const environment = getEnvironment();
let stopping = false;

process.stdout.write(
  JSON.stringify({
    service: "tymra-worker",
    event: "worker_started",
    providerMode: environment.PROVIDER_MODE,
    publicCollectionMode: environment.PUBLIC_COLLECTION_MODE,
  }) + "\n",
);

process.on("SIGTERM", () => {
  stopping = true;
});

process.on("SIGINT", () => {
  stopping = true;
});

await recoverExpiredJobs();
let lastLeaseRecoveryAt = Date.now();

while (!stopping) {
  if (Date.now() - lastLeaseRecoveryAt >= Math.max(30_000, environment.WORKER_LEASE_SECONDS * 1_000)) {
    await recoverExpiredJobs();
    lastLeaseRecoveryAt = Date.now();
  }
  const job = await claimNextJob(environment.WORKER_ID, environment.WORKER_LEASE_SECONDS);
  if (!job) {
    await wait(environment.WORKER_POLL_INTERVAL_MS);
    continue;
  }

  logJob("job_started", job);

  let heartbeatError: unknown;
  const heartbeat = setInterval(() => {
    void renewJobLease(job.id, environment.WORKER_ID, environment.WORKER_LEASE_SECONDS).catch((error) => { heartbeatError = error; });
  }, Math.max(5_000, Math.floor(environment.WORKER_LEASE_SECONDS * 1_000 / 3)));
  try {
    await handleJob(job, environment);
    if (heartbeatError) throw heartbeatError;
    await markJobSucceeded(job.id, environment.WORKER_ID);
    logJob("job_succeeded", job);
  } catch (error) {
    if (error instanceof DeferredJobError) {
      try {
        await deferClaimedJob(job.id, environment.WORKER_ID, error.resumeAt, error.message);
        if (job.type !== "ARGUS_JOB_POLL") {
          const activeExternalExecution = await prisma.argusExecution.findFirst({
            where: { parentJobId: job.id, status: { in: ["SUBMITTED", "RUNNING", "WAITING_FOR_MANUAL", "CANCEL_REQUESTED"] } },
            select: { id: true },
          });
          if (!activeExternalExecution) {
            await prisma.job.updateMany({
              where: { id: job.id, status: "PENDING", lastErrorCode: "WAITING_EXTERNAL" },
              data: { runAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
            });
          }
        }
        logJob("job_deferred", job, { resumeAt: error.resumeAt.toISOString(), message: error.message });
      } catch (settlementError) {
        logJob("job_settlement_skipped", job, { errorCode: "WAITING_EXTERNAL", message: settlementError instanceof Error ? settlementError.message : "Unable to defer job" });
      }
      continue;
    }
    const failure = classifyJobFailure(error);
    try {
      await markJobFailed(job, environment.WORKER_ID, failure.code, failure.message, failure.retryable);
      logJob("job_failed", job, { errorCode: failure.code, message: failure.message, retryable: failure.retryable });
    } catch (settlementError) {
      logJob("job_settlement_skipped", job, { errorCode: failure.code, message: settlementError instanceof Error ? settlementError.message : "Unable to settle job" });
    }
  } finally {
    clearInterval(heartbeat);
  }
}

await prisma.$disconnect();

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function logJob(event: string, job: Awaited<ReturnType<typeof claimNextJob>> & object, extra: Record<string, unknown> = {}) {
  if (!job) return;
  process.stdout.write(`${JSON.stringify({ service: "tymra-worker", event, jobId: job.id, jobType: job.type, queueName: job.queueName, correlationId: job.correlationId, analysisRequestId: job.analysisRequestId, collectionRunId: job.collectionRunId, sourceId: job.sourceId, listingId: job.listingId, sellableUnitId: job.sellableUnitId, querySignatureHash: job.querySignatureHash, snapshotId: job.snapshotId, resultVersionId: job.resultVersionId, attemptCount: job.attemptCount, ...extra })}\n`);
}
