import { getEnvironment } from "@tymra/config";
import { claimNextJob, markJobFailed, markJobSucceeded, prisma, recoverExpiredJobs, renewJobLease } from "@tymra/db";
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

while (!stopping) {
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
    const message = error instanceof Error ? error.message : "Unknown worker error";
    await markJobFailed(job, environment.WORKER_ID, "JOB_HANDLER_ERROR", message, true);
    logJob("job_failed", job, { errorCode: "JOB_HANDLER_ERROR", message });
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
