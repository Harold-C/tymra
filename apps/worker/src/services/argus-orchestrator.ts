import { createHash } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Environment } from "@tymra/config";
import { enqueueJob, prisma, Prisma } from "@tymra/db";
import {
  acknowledgeArgusJobResult,
  cancelArgusJob,
  downloadArgusEvidence,
  getArgusJob,
  getArgusJobResult,
  isTerminalArgusJobStatus,
  mapArgusJobResult,
  submitArgusCapture,
  type ArgusCaptureInput,
  type ArgusEvidencePointer,
  type ArgusJobResult,
  type ArgusResultDelivery,
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
    const noVncCapacity = await memberNoVncCapacity(context.parentJobId);
    if (!noVncCapacity.allowed) return { ok: false, httpStatus: 429, message: "The membership already has the maximum number of active manual browser sessions" };
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

  if ((execution.status === "COMPLETED" || execution.status === "FAILED") && execution.result) {
    return mapArgusJobResult(execution.result as unknown as ArgusJobResult, input, environment);
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

async function memberNoVncCapacity(parentJobId: string) {
  const parent = await prisma.job.findUnique({ where: { id: parentJobId }, select: { priceCheck: { select: { customerUserId: true, customerUser: { select: { membership: { select: { plan: true } } } } } } } });
  const customerUserId = parent?.priceCheck?.customerUserId;
  if (!customerUserId) return { allowed: true };
  const plan = parent.priceCheck?.customerUser?.membership?.plan ?? "FREE";
  const limit = plan === "FREE" || plan === "HOST" ? 1 : plan === "PRO" ? 2 : 4;
  const jobs = await prisma.job.findMany({ where: { priceCheck: { customerUserId } }, select: { id: true } });
  const executions = await prisma.argusExecution.findMany({ where: { parentJobId: { in: jobs.map((job) => job.id) }, status: "WAITING_FOR_MANUAL", result: { not: Prisma.DbNull } }, select: { result: true } });
  const active = executions.filter((item) => {
    const result = item.result as Record<string, unknown> | null;
    const action = result && typeof result.operator_action === "object" && result.operator_action && !Array.isArray(result.operator_action) ? result.operator_action as Record<string, unknown> : null;
    return typeof action?.expires_at === "string" && Date.parse(action.expires_at) > Date.now();
  }).length;
  return { allowed: active < limit, active, limit };
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
    const waitingForManual = remoteStatus === "WAITING_FOR_MANUAL";
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        status: waitingForManual ? "WAITING_FOR_MANUAL" : remoteStatus === "CANCEL_REQUESTED" ? "CANCEL_REQUESTED" : "RUNNING",
        ...(waitingForManual ? { result: statusResponse.job as unknown as Prisma.InputJsonValue } : {}),
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
    where: { parentJobId, status: { in: ["COMPLETED", "FAILED"] }, result: { not: Prisma.DbNull } },
    select: { argusJobId: true, collectionRunId: true, result: true },
  });
  const parentRuns = await prisma.collectionRun.findMany({
    where: { jobId: parentJobId },
    select: { id: true },
  });
  const collectionRunIds = [...new Set([
    ...executions.map((execution) => execution.collectionRunId),
    ...parentRuns.map((run) => run.id),
  ])];
  for (const execution of executions) {
    const result = execution.result as unknown as Partial<ArgusJobResult> | null;
    if (!result?.result_sha256) {
      throw new Error(`Persisted Argus result ${execution.argusJobId} has no result SHA-256`);
    }
    await retainArgusEvidence(environment, collectionRunIds, result as ArgusJobResult);
  }
  if (collectionRunIds.length > 0) {
    const remaining = await prisma.rawArtifact.count({
      where: { collectionRunId: { in: collectionRunIds }, storageRef: { startsWith: "argus-evidence:" }, deletedAt: null },
    });
    if (remaining > 0) throw new Error(`${remaining} Argus evidence artifacts remain remote before ACK`);
  }
  for (const execution of executions) {
    const result = execution.result as unknown as ArgusJobResult;
    const acknowledgement = await acknowledgeArgusJobResult(
      environment,
      execution.argusJobId,
      result.result_sha256!,
    );
    if (!acknowledgement.ok) {
      throw new Error(`Argus result acknowledgement failed: ${acknowledgement.message}`);
    }
    const purged = await getArgusJobResult(environment, execution.argusJobId);
    if (purged.ok || purged.httpStatus !== 410) {
      throw new Error(`Argus result purge verification failed for ${execution.argusJobId}`);
    }
  }
}

export async function finalizeDirectArgusDelivery(
  environment: Environment,
  collectionRunId: string,
  delivery: ArgusResultDelivery,
  retainEvidence: boolean,
): Promise<void> {
  if (retainEvidence) {
    await retainArgusEvidence(environment, [collectionRunId], delivery.job);
    const remaining = await prisma.rawArtifact.count({
      where: { collectionRunId, storageRef: { startsWith: "argus-evidence:" }, deletedAt: null },
    });
    if (remaining > 0) throw new Error(`${remaining} Argus evidence artifacts remain remote before ACK`);
  } else {
    for (const pointer of delivery.job.items.flatMap((item) => item.result?.evidence ?? [])) {
      await downloadArgusEvidence(environment, pointer);
    }
  }
  const acknowledgement = await acknowledgeArgusJobResult(environment, delivery.jobId, delivery.resultSha256);
  if (!acknowledgement.ok) throw new Error(`Argus result acknowledgement failed: ${acknowledgement.message}`);
  const purged = await getArgusJobResult(environment, delivery.jobId);
  if (purged.ok || purged.httpStatus !== 410) {
    throw new Error(`Argus result purge verification failed for ${delivery.jobId}`);
  }
}

async function retainArgusEvidence(environment: Environment, collectionRunIds: string[], result: ArgusJobResult) {
  const pointers = result.items.flatMap((item) => item.result?.evidence ?? []);
  if (pointers.length === 0) return;
  const evidence = pointers.map((pointer) => {
    const relativePath = retainedEvidencePath(pointer);
    return { pointer, relativePath, localStorageRef: `tymra-evidence:${relativePath}` };
  });
  const artifacts = await prisma.rawArtifact.findMany({
    where: {
      collectionRunId: { in: collectionRunIds },
      storageRef: { in: [...new Set(evidence.flatMap(({ pointer, localStorageRef }) => [pointer.storageRef, localStorageRef]))] },
      deletedAt: null,
    },
    select: { id: true, storageRef: true, contentHash: true },
  });

  const artifactsByReference = new Map<string, typeof artifacts>();
  for (const artifact of artifacts) {
    const key = `${artifact.storageRef}\0${artifact.contentHash}`;
    artifactsByReference.set(key, [...(artifactsByReference.get(key) ?? []), artifact]);
  }
  for (const { pointer, relativePath, localStorageRef } of evidence) {
    const localArtifacts = artifactsByReference.get(`${localStorageRef}\0${pointer.sha256}`) ?? [];
    const remoteArtifacts = artifactsByReference.get(`${pointer.storageRef}\0${pointer.sha256}`) ?? [];
    if (localArtifacts.length + remoteArtifacts.length === 0) {
      throw new Error(`Argus evidence ${pointer.storageRef} was not persisted with its verified hash`);
    }
    if (remoteArtifacts.length > 0) {
      if (localArtifacts.length === 0) {
        const content = await downloadArgusEvidence(environment, pointer);
        const target = resolveRetainedEvidencePath(environment.ARGUS_EVIDENCE_ROOT, relativePath);
        await mkdir(path.dirname(target), { recursive: true });
        const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
        await writeFile(temporary, content, { mode: 0o600 });
        await rename(temporary, target);
      }
      const remoteArtifactIds = remoteArtifacts.map((artifact) => artifact.id);
      const updated = await prisma.rawArtifact.updateMany({
        where: { id: { in: remoteArtifactIds }, storageRef: pointer.storageRef, contentHash: pointer.sha256 },
        data: { storageRef: localStorageRef },
      });
      if (updated.count !== remoteArtifactIds.length) {
        throw new Error(`Argus evidence artifacts changed before they could be retained`);
      }
    }
  }
}

function retainedEvidencePath(pointer: ArgusEvidencePointer): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(pointer.traceId)) throw new Error("Argus evidence trace ID is invalid");
  if (pointer.kind === "html") return `${pointer.traceId}/page.html`;
  if (pointer.kind === "screenshot") return `${pointer.traceId}/screenshot.png`;
  if (pointer.kind === "download") {
    const fileName = pointer.filename;
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/u.test(fileName)) throw new Error("Argus download evidence filename is invalid");
    return `${pointer.traceId}/downloads/${fileName}`;
  }
  throw new Error(`Argus evidence kind ${String(pointer.kind)} cannot be retained`);
}

function resolveRetainedEvidencePath(root: string, relativePath: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relativePath);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Argus evidence path escapes its root");
  return target;
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
