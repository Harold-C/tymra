import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, rename } from "node:fs/promises";
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
import { nzStartOfDay } from "@tymra/domain";
import { ACTIVE_OTA_SOURCE_KEYS } from "../operations/ota-health";
import { isProductionOtaPayload, OTA_DAILY_EXECUTION_BUDGET, otaSourceApproved, productionOtaDailyBudgetWaivedForTrial } from "../operations/production-ota";
import { withRedisLockWait } from "@tymra/queue";

const pollDelayMs = 1_000;
const queueAwarePublicConnectors = new Set(["eventfinda-public", "ticketmaster-public", "sporty-school-sport-public"]);

function publicQueueDeadline(environment: Environment, submittedAt: Date) {
  return new Date(submittedAt.getTime() + (environment.ARGUS_PUBLIC_QUEUE_TIMEOUT_MS ?? 3_600_000));
}

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
  if (environment.NODE_ENV === "production" && ACTIVE_OTA_SOURCE_KEYS.some((key) => input.connectorId === `${key}-public`)) {
    return withRedisLockWait("tymra:production-ota-submission", Math.max(120_000, environment.ARGUS_TIMEOUT_MS * 2), () => captureDurableArgus(environment, input, context));
  }
  return captureDurableArgus(environment, input, context);
}

async function captureDurableArgus(environment: Environment, input: ArgusCaptureInput, context: DurableCaptureContext): Promise<CaptureResponse> {
  const orchestrationKey = `${context.parentJobId}:${input.traceId}`;
  let execution = await prisma.argusExecution.findUnique({ where: { orchestrationKey } });
  if (await settleCancelledCollectionRun(context.parentJobId)) {
    throw new DeferredJobError(`Parent Job ${context.parentJobId} was cancelled`, new Date());
  }

  if (!execution) {
    if (environment.NODE_ENV === "production" && ACTIVE_OTA_SOURCE_KEYS.some((key) => input.connectorId === `${key}-public`)) {
      const parent = await prisma.job.findUniqueOrThrow({ where: { id: context.parentJobId } });
      const source = await prisma.dataSource.findUniqueOrThrow({ where: { id: context.dataSourceId } });
      if (!isProductionOtaPayload(parent.payload) || parent.payload.sourceId !== source.key || !otaSourceApproved(source)) return { ok: false, httpStatus: 403, message: "Unapproved production OTA capture" };
      const count = await prisma.argusExecution.count({ where: { dataSourceId: source.id, submittedAt: { gte: nzStartOfDay(new Date()) } } });
      const jobCount = await prisma.argusExecution.count({ where: { parentJobId: context.parentJobId } });
      const dailyBudgetWaived = productionOtaDailyBudgetWaivedForTrial(source.metadata, parent.idempotencyKey);
      if ((!dailyBudgetWaived && count >= OTA_DAILY_EXECUTION_BUDGET) || jobCount >= 3) return { ok: false, httpStatus: 429, message: "Bounded OTA execution budget exhausted" };
      const active = await prisma.argusExecution.count({ where: { connectorId: { in: ACTIVE_OTA_SOURCE_KEYS.map((key) => `${key}-public`) }, status: { in: ["SUBMITTED", "RUNNING", "WAITING_FOR_MANUAL", "CANCEL_REQUESTED"] } } });
      if (active) return { ok: false, httpStatus: 429, message: "Another Tymra OTA execution is active" };
    }
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
        deadlineAt: queueAwarePublicConnectors.has(input.connectorId)
          ? publicQueueDeadline(environment, new Date())
          : new Date(Date.now() + environment.ARGUS_JOB_POLL_TIMEOUT_MS),
      },
      update: {},
    });
  }

  if ((execution.status === "COMPLETED" || execution.status === "FAILED") && execution.result && execution.errorCategory !== "TIMEOUT") {
    return mapArgusJobResult(execution.result as unknown as ArgusJobResult, input, environment);
  }
  if (execution.status === "FAILED" || execution.status === "CANCELLED") {
    return {
      ok: false,
      httpStatus: execution.errorCategory === "TIMEOUT" ? 504 : execution.status === "CANCELLED" ? 409 : 502,
      message: execution.errorMessage ?? `Argus execution ended with ${execution.status}`,
    };
  }
  const boundedCapture = environment.NODE_ENV === "production" && ACTIVE_OTA_SOURCE_KEYS.some((key) => input.connectorId === `${key}-public`);
  if (execution.deadlineAt <= new Date() && !boundedCapture && !queueAwarePublicConnectors.has(input.connectorId)) {
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
    (boundedCapture || queueAwarePublicConnectors.has(input.connectorId)) && execution.deadlineAt <= new Date() ? new Date(Date.now() + 30_000) : execution.deadlineAt,
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

  const parent = await prisma.job.findUnique({ where: { id: execution.parentJobId }, select: { status: true, payload: true } });
  const queueAware = queueAwarePublicConnectors.has(execution.connectorId);
  if ((!parent || parent.status === "CANCELLED") && !queueAware) {
    await cancelArgusJob(environment, execution.argusJobId);
    await settleCancelledCollectionRun(execution.parentJobId);
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: { status: "CANCEL_REQUESTED", lastPolledAt: new Date() },
    });
  }

  if (execution.deadlineAt <= new Date() && environment.NODE_ENV === "production" && isProductionOtaPayload(parent?.payload)) {
    try { await cancelArgusJob(environment, execution.argusJobId, true); }
    catch { throw new DeferredJobError("Bounded OTA cancellation is not yet confirmed", new Date(Date.now() + 30_000)); }
    const released = await getArgusJob(environment, execution.argusJobId);
    if (!released.ok || !isTerminalArgusJobStatus(released.job.status)) throw new DeferredJobError("Waiting for bounded OTA shared-session release", new Date(Date.now() + 30_000));
  } else if (execution.deadlineAt <= new Date() && !queueAware) {
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
    if (queueAware && (execution.deadlineAt <= new Date() || execution.status === "CANCEL_REQUESTED")) {
      await prisma.argusExecution.update({ where: { id: execution.id }, data: { status: "CANCEL_REQUESTED", errorCategory: "TIMEOUT", errorMessage: execution.errorMessage ?? "Argus public deadline expired; cancellation pending", lastPolledAt: new Date() } });
      try { await cancelArgusJob(environment, execution.argusJobId, true); } catch { /* Retry confirmation without submitting another capture. */ }
      throw new DeferredJobError("Waiting for public capture cancellation confirmation", new Date(Date.now() + 30_000));
    }
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        lastPolledAt: new Date(),
        errorCategory: execution.errorCategory === "ACCESS_CHALLENGE" ? "ACCESS_CHALLENGE" : `HTTP_${statusResponse.httpStatus}`,
        errorMessage: execution.errorCategory === "ACCESS_CHALLENGE" ? execution.errorMessage : statusResponse.message,
        retryable: execution.errorCategory === "ACCESS_CHALLENGE" ? false : statusResponse.httpStatus >= 500,
      },
    });
    throw new DeferredJobError(statusResponse.message, nextPoll(execution.deadlineAt));
  }

  const remoteStatus = statusResponse.job.status;
  let deadlineAt = execution.deadlineAt;
  if (queueAware && !isTerminalArgusJobStatus(remoteStatus)) {
    const startedAt = Date.parse(statusResponse.job.started_at ?? "");
    const queueDeadline = publicQueueDeadline(environment, execution.submittedAt);
    deadlineAt = Number.isFinite(startedAt) && startedAt <= queueDeadline.getTime()
      ? new Date(Math.min(startedAt + environment.ARGUS_JOB_POLL_TIMEOUT_MS, queueDeadline.getTime() + environment.ARGUS_JOB_POLL_TIMEOUT_MS))
      : queueDeadline;
    if (deadlineAt <= new Date() || execution.status === "CANCEL_REQUESTED" || !parent || parent.status === "CANCELLED") {
      const parentCancelled = !parent || parent.status === "CANCELLED";
      const message = parentCancelled ? "Parent collection was cancelled" : Number.isFinite(startedAt) && startedAt <= queueDeadline.getTime() ? "Argus public execution timed out" : "Argus public queue waiting timed out";
      await prisma.argusExecution.update({ where: { id: execution.id }, data: { status: "CANCEL_REQUESTED", deadlineAt, errorCategory: parentCancelled ? "CANCELLED" : "TIMEOUT", errorMessage: message, lastPolledAt: new Date() } });
      try { await cancelArgusJob(environment, execution.argusJobId, true); }
      catch { throw new DeferredJobError("Public capture cancellation is not yet accepted", new Date(Date.now() + 30_000)); }
      const released = await getArgusJob(environment, execution.argusJobId);
      if (!released.ok || !isTerminalArgusJobStatus(released.job.status)) {
        throw new DeferredJobError("Waiting for this public capture to release its own session", new Date(Date.now() + 30_000));
      }
      await prisma.argusExecution.update({ where: { id: execution.id }, data: { status: parentCancelled ? "CANCELLED" : "FAILED", deadlineAt, errorCategory: parentCancelled ? "CANCELLED" : "TIMEOUT", errorMessage: message, retryable: !parentCancelled, lastPolledAt: new Date(), completedAt: new Date() } });
      await settleCancelledCollectionRun(execution.parentJobId);
      await wakeParent(execution.parentJobId);
      return;
    }
  }
  if (!isTerminalArgusJobStatus(remoteStatus)) {
    const waitingForManual = remoteStatus === "WAITING_FOR_MANUAL";
    const action = statusResponse.job.operator_action;
    const boundedCaptcha = isProductionOtaPayload(parent?.payload)
      && execution.connectorId === `${parent.payload.sourceId}-public`
      && action?.required === true && action.type === "novnc_handoff"
      && action.issue_url === "/v1/handoffs" && action.reason === "captcha"
      && typeof action.session_id === "string" && action.session_id.length > 0
      && action.session_id.length <= 256 && Number.isInteger(action.session_ttl_seconds)
      && action.session_ttl_seconds > 0 && action.session_ttl_seconds <= 900
      && Date.parse(action.expires_at) > Date.now()
      && Date.parse(action.expires_at) <= Date.now() + action.session_ttl_seconds * 1_000 + 1_000;
    if (waitingForManual && environment.NODE_ENV === "production" && isProductionOtaPayload(parent?.payload) && !boundedCaptcha) {
      // Only a valid CAPTCHA handoff may wait within the existing execution
      // deadline. Other challenges release this pilot's own browser session.
      try { await cancelArgusJob(environment, execution.argusJobId, true); }
      catch { throw new DeferredJobError("Unable to release the bounded OTA challenge session", nextPoll(execution.deadlineAt)); }
      await prisma.argusExecution.update({ where: { id: execution.id }, data: { status: "CANCEL_REQUESTED", result: statusResponse.job as unknown as Prisma.InputJsonValue, errorCategory: "ACCESS_CHALLENGE", errorMessage: "Bounded public OTA challenge stopped; waiting for its own session release", retryable: false, lastPolledAt: new Date() } });
      throw new DeferredJobError("Waiting for bounded OTA challenge cancellation", nextPoll(execution.deadlineAt));
    }
    await prisma.argusExecution.update({
      where: { id: execution.id },
      data: {
        status: waitingForManual ? "WAITING_FOR_MANUAL" : remoteStatus === "CANCEL_REQUESTED" ? "CANCEL_REQUESTED" : queueAware && remoteStatus === "QUEUED" ? "SUBMITTED" : "RUNNING",
        ...(queueAware ? { deadlineAt } : {}),
        ...(waitingForManual ? { result: statusResponse.job as unknown as Prisma.InputJsonValue } : {}),
        lastPolledAt: new Date(),
        errorCategory: execution.errorCategory === "ACCESS_CHALLENGE" ? "ACCESS_CHALLENGE" : null,
        errorMessage: execution.errorCategory === "ACCESS_CHALLENGE" ? execution.errorMessage : null,
        retryable: execution.errorCategory === "ACCESS_CHALLENGE" ? false : null,
      },
    });
    throw new DeferredJobError(`Argus job ${execution.argusJobId} is ${remoteStatus}`,
      queueAware && remoteStatus === "QUEUED" ? new Date(Math.min(deadlineAt.getTime(), Date.now() + 30_000)) : nextPoll(deadlineAt));
  }

  const resultResponse = await getArgusJobResult(environment, execution.argusJobId);
  if (!resultResponse.ok) {
    throw new DeferredJobError(resultResponse.message, queueAware && execution.deadlineAt <= new Date() ? new Date(Date.now() + 30_000) : nextPoll(execution.deadlineAt));
  }
  const job = resultResponse.job;
  const terminalStatus = job.status === "CANCELLED"
    ? "CANCELLED"
    : job.status === "COMPLETED" || job.status === "COMPLETED_WITH_WARNINGS"
      ? "COMPLETED"
      : "FAILED";
  const matchingItem = job.items?.find((item) => item.trace_id === execution.traceId);
  const itemCategory = matchingItem?.error_category ?? matchingItem?.result?.error?.category;
  const safeItemCategory = typeof itemCategory === "string" && /^[A-Z][A-Z0-9_]{0,63}$/u.test(itemCategory)
    ? itemCategory : null;
  await prisma.argusExecution.update({
    where: { id: execution.id },
    data: {
      status: queueAware && execution.errorCategory === "TIMEOUT" ? "FAILED" : terminalStatus,
      result: job as unknown as Prisma.InputJsonValue,
      errorCategory: queueAware && execution.errorCategory === "TIMEOUT" ? "TIMEOUT" : execution.errorCategory === "ACCESS_CHALLENGE" ? "ACCESS_CHALLENGE" : job.error?.category ?? safeItemCategory,
      errorMessage: queueAware && execution.errorCategory === "TIMEOUT" ? execution.errorMessage : execution.errorCategory === "ACCESS_CHALLENGE" ? "Bounded public OTA challenge cancelled and session released" : job.error?.message ?? null,
      retryable: job.error?.retryable ?? matchingItem?.result?.error?.retryable ?? null,
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
  const boundedPilot = environment.NODE_ENV === "production" && isProductionOtaPayload((await prisma.job.findUnique({ where: { id: parentJobId }, select: { payload: true } }))?.payload);
  const executions = await prisma.argusExecution.findMany({
    where: { parentJobId, status: { in: boundedPilot ? ["COMPLETED", "FAILED", "CANCELLED"] : ["COMPLETED", "FAILED"] }, result: { not: Prisma.DbNull } },
    select: { id: true, argusJobId: true, collectionRunId: true, result: true },
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
    await prisma.argusExecution.updateMany({
      where: { id: execution.id, deliveryVerifiedAt: null },
      data: { deliveryVerifiedAt: new Date() },
    });
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
    const target = resolveRetainedEvidencePath(environment.ARGUS_EVIDENCE_ROOT, relativePath);
    // A prior attempt may have renamed the file before its directory or DB update completed.
    const existing = await open(target, "r+").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT" && localArtifacts.length === 0) return null;
      throw error;
    });
    if (existing) {
      try {
        verifyRetainedEvidence(await existing.readFile(), pointer);
        await existing.sync();
      } finally {
        await existing.close();
      }
    } else {
      const content = await downloadArgusEvidence(environment, pointer);
      verifyRetainedEvidence(content, pointer);
      await mkdir(path.dirname(target), { recursive: true });
      const temporary = `${target}.${randomUUID()}.tmp`;
      const file = await open(temporary, "wx", 0o600);
      try {
        await file.writeFile(content);
        await file.sync();
      } finally {
        await file.close();
      }
      // Leave the temporary or renamed bytes available for recovery if a sync fails.
      await rename(temporary, target);
    }
    await syncEvidenceDirectories(path.dirname(target));
    if (remoteArtifacts.length > 0) {
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

function verifyRetainedEvidence(content: Buffer, pointer: ArgusEvidencePointer) {
  if (content.byteLength !== pointer.sizeBytes
    || createHash("sha256").update(content).digest("hex") !== pointer.sha256) {
    throw new Error(`Retained Argus evidence integrity check failed for ${pointer.traceId}/${pointer.kind}`);
  }
}

async function syncEvidenceDirectories(directory: string) {
  // mkdir(recursive) can create parent entries; sync each directory before changing DB refs or ACKing.
  for (;;) {
    const handle = await open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
    const parent = path.dirname(directory);
    if (parent === directory) return;
    directory = parent;
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
