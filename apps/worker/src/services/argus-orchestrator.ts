import { createHash } from "node:crypto";

import type { Environment } from "@tymra/config";
import { enqueueJob, prisma, type Prisma } from "@tymra/db";
import {
  acknowledgeArgusJobResult,
  cancelArgusJob,
  getArgusJob,
  getArgusJobResult,
  isTerminalArgusJobStatus,
  mapArgusJobResult,
  submitArgusCapture,
  type ArgusCaptureInput,
  type ArgusJobResult,
  type CaptureResponse,
} from "../clients/argus-client";
import { DeferredJobError } from "../jobs/deferred-job";

const pollDelayMs = 1_000;

type DurableCaptureContext = {
  parentJobId: string;
  collectionRunId: string;
  dataSourceId: string;
};

export function durableArgusTraceId(
  parentJobId: string,
  connectorId: ArgusCaptureInput["connectorId"],
  workflowId: ArgusCaptureInput["workflowId"],
  url: string,
): string {
  const digest = createHash("sha256").update(`${parentJobId}\0${connectorId}\0${workflowId}\0${url}`).digest("hex").slice(0, 24);
  return `${connectorId}-${workflowId}-${digest}`;
}

export async function captureBrowserTaskWithDurableArgus(
  environment: Environment,
  input: ArgusCaptureInput,
  context: DurableCaptureContext,
): Promise<CaptureResponse> {
  const orchestrationKey = `${context.parentJobId}:${input.traceId}`;
  let execution = await prisma.argusExecution.findUnique({ where: { orchestrationKey } });
  if (await settleCancelledCollectionRun(context.parentJobId)) {
    throw new DeferredJobError(`Parent Job ${context.parentJobId} was cancelled`, new Date());
  }

  if (!execution) {
    const submission = await submitArgusCapture(environment, input);
    if (!submission.ok) return submission;
    execution = await prisma.argusExecution.upsert({
      where: { orchestrationKey },
      create: {
        orchestrationKey,
        parentJobId: context.parentJobId,
        collectionRunId: context.collectionRunId,
        dataSourceId: context.dataSourceId,
        argusJobId: submission.job.job_id,
        traceId: input.traceId,
        connectorId: input.connectorId,
        workflowId: input.workflowId,
        requestedUrl: input.url,
        status: submission.job.status === "RUNNING" ? "RUNNING" : "SUBMITTED",
        deadlineAt: new Date(Date.now() + environment.ARGUS_JOB_POLL_TIMEOUT_MS),
      },
      update: {},
    });
  }

  if (execution.status === "COMPLETED" && execution.result) {
    return mapArgusJobResult(execution.result as unknown as ArgusJobResult, input);
  }
  if (execution.status === "FAILED" || execution.status === "CANCELLED") {
    return {
      ok: false,
      httpStatus: execution.errorCategory === "TIMEOUT" ? 504 : execution.status === "CANCELLED" ? 409 : 502,
      message: execution.errorMessage ?? `Argus execution ended with ${execution.status}`,
    };
  }
  if (execution.deadlineAt <= new Date()) {
    await cancelArgusJob(environment, execution.argusJobId);
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        errorCategory: "TIMEOUT",
        errorMessage: "Argus job polling timed out",
        retryable: true,
        completedAt: new Date(),
      },
    });
    return { ok: false, httpStatus: 504, message: "Argus job polling timed out" };
  }

  await enqueueJob({
    type: "ARGUS_JOB_POLL",
    queueName: "argus-job-poll",
    payload: { executionId: execution.id },
    idempotencyKey: `argus-poll:${execution.id}`,
    correlationId: context.parentJobId,
    collectionRunId: context.collectionRunId,
    maxAttempts: 3,
  });
  throw new DeferredJobError(
    `Waiting for Argus job ${execution.argusJobId}`,
    execution.deadlineAt,
  );
}

export async function pollArgusExecution(environment: Environment, executionId: string): Promise<void> {
  const execution = await prisma.argusExecution.findUniqueOrThrow({ where: { id: executionId } });
  if (execution.status === "COMPLETED" || execution.status === "FAILED" || execution.status === "CANCELLED") {
    await settleCancelledCollectionRun(execution.parentJobId);
    await wakeParent(execution.parentJobId);
    return;
  }

  const parent = await prisma.job.findUnique({ where: { id: execution.parentJobId }, select: { status: true } });
  if (!parent || parent.status === "CANCELLED") {
    await cancelArgusJob(environment, execution.argusJobId);
    await settleCancelledCollectionRun(execution.parentJobId);
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: { status: "CANCEL_REQUESTED", lastPolledAt: new Date() },
    });
  }

  if (execution.deadlineAt <= new Date()) {
    await cancelArgusJob(environment, execution.argusJobId);
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        status: "FAILED",
        errorCategory: "TIMEOUT",
        errorMessage: "Argus job polling timed out",
        retryable: true,
        lastPolledAt: new Date(),
        completedAt: new Date(),
      },
    });
    await wakeParent(execution.parentJobId);
    return;
  }

  const statusResponse = await getArgusJob(environment, execution.argusJobId);
  if (!statusResponse.ok) {
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        lastPolledAt: new Date(),
        errorCategory: `HTTP_${statusResponse.httpStatus}`,
        errorMessage: statusResponse.message,
        retryable: statusResponse.httpStatus >= 500,
      },
    });
    throw new DeferredJobError(statusResponse.message, nextPoll(execution.deadlineAt));
  }

  const remoteStatus = statusResponse.job.status;
  if (!isTerminalArgusJobStatus(remoteStatus)) {
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        status: remoteStatus === "CANCEL_REQUESTED" ? "CANCEL_REQUESTED" : "RUNNING",
        lastPolledAt: new Date(),
        errorCategory: null,
        errorMessage: null,
        retryable: null,
      },
    });
    throw new DeferredJobError(`Argus job ${execution.argusJobId} is ${remoteStatus}`, nextPoll(execution.deadlineAt));
  }

  const resultResponse = await getArgusJobResult(environment, execution.argusJobId);
  if (!resultResponse.ok) {
    throw new DeferredJobError(resultResponse.message, nextPoll(execution.deadlineAt));
  }
  const job = resultResponse.job;
  const terminalStatus = job.status === "CANCELLED"
    ? "CANCELLED"
    : job.status === "COMPLETED" || job.status === "COMPLETED_WITH_WARNINGS"
      ? "COMPLETED"
      : "FAILED";
  await prisma.argusExecution.update({
    where: { id: execution.id },
    data: {
      status: terminalStatus,
      result: job as unknown as Prisma.InputJsonValue,
      errorCategory: job.error?.category ?? null,
      errorMessage: job.error?.message ?? null,
      retryable: job.error?.retryable ?? null,
      lastPolledAt: new Date(),
      completedAt: new Date(),
    },
  });
  await settleCancelledCollectionRun(execution.parentJobId);
  await wakeParent(execution.parentJobId);
}

export async function acknowledgePersistedArgusResults(
  environment: Environment,
  parentJobId: string,
): Promise<void> {
  const executions = await prisma.argusExecution.findMany({
    where: { parentJobId, status: "COMPLETED" },
    select: { argusJobId: true, result: true },
  });
  for (const execution of executions) {
    const result = execution.result as unknown as Partial<ArgusJobResult> | null;
    if (!result?.result_sha256) {
      throw new Error(`Persisted Argus result ${execution.argusJobId} has no result SHA-256`);
    }
    const acknowledgement = await acknowledgeArgusJobResult(
      environment,
      execution.argusJobId,
      result.result_sha256,
    );
    if (!acknowledgement.ok) {
      throw new Error(`Argus result acknowledgement failed: ${acknowledgement.message}`);
    }
  }
}

export async function settleCancelledCollectionRun(parentJobId: string): Promise<boolean> {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId }, select: { status: true, completedAt: true } });
  if (parent?.status !== "CANCELLED") return false;
  await prisma.collectionRun.updateMany({
    where: {
      jobId: parentJobId,
      status: { not: "CANCELLED" },
      OR: [
        { status: { in: ["PENDING", "RUNNING"] } },
        ...(parent.completedAt ? [{ finishedAt: { gte: parent.completedAt } }] : []),
      ],
    },
    data: {
      status: "CANCELLED",
      finishedAt: new Date(),
      errorCode: "JOB_CANCELLED",
      errorSummary: "Collection stopped because its parent Job was cancelled",
    },
  });
  return true;
}

async function wakeParent(parentJobId: string) {
  await prisma.job.updateMany({
    where: { id: parentJobId, status: "PENDING", lastErrorCode: "WAITING_EXTERNAL" },
    data: { runAt: new Date(), lastErrorCode: null, lastErrorMessage: null },
  });
}

function nextPoll(deadlineAt: Date): Date {
  return new Date(Math.min(deadlineAt.getTime(), Date.now() + pollDelayMs));
}
