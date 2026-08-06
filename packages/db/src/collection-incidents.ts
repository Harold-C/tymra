import type { CollectionIncident, CollectionRun, Prisma } from "@prisma/client";

import { prisma } from "./index";

export async function syncCollectionIncident(collectionRunId: string, db: Prisma.TransactionClient = prisma): Promise<CollectionIncident | null> {
  const run = await db.collectionRun.findUniqueOrThrow({
    where: { id: collectionRunId },
    include: { dataSource: { select: { key: true, name: true } } },
  });
  if (run.status === "PENDING" || run.status === "RUNNING" || run.status === "CANCELLED") return null;

  const retryParent = run.jobId
    ? await db.collectionIncident.findUnique({ where: { retryJobId: run.jobId } })
    : null;
  if (run.status === "SUCCEEDED") {
    if (retryParent) {
      await db.collectionIncident.update({
        where: { id: retryParent.id },
        data: {
          status: "RESOLVED",
          resolutionAction: "RETRY_SUCCEEDED",
          resolutionReason: `Retry collection run ${run.id} succeeded`,
          resolvedAt: run.finishedAt ?? new Date(),
        },
      });
    }
    return null;
  }

  const diagnostics = await collectionRunDiagnostics(run.id, db);
  const incident = await db.collectionIncident.upsert({
    where: { collectionRunId: run.id },
    create: {
      collectionRunId: run.id,
      severity: severityFor(run),
      category: run.errorCode ?? (run.status === "PARTIAL" ? "PARTIAL_FAILURE" : "COLLECTION_FAILED"),
      title: `${run.dataSource.name} collection ${run.status.toLowerCase()}`,
      summary: run.errorSummary ?? summaryFor(run, diagnostics),
      evidence: evidenceFor(run, diagnostics),
      isDemo: run.isDemo,
    },
    update: {
      severity: severityFor(run),
      category: run.errorCode ?? (run.status === "PARTIAL" ? "PARTIAL_FAILURE" : "COLLECTION_FAILED"),
      title: `${run.dataSource.name} collection ${run.status.toLowerCase()}`,
      summary: run.errorSummary ?? summaryFor(run, diagnostics),
      evidence: evidenceFor(run, diagnostics),
    },
  });

  await db.collectionIncident.updateMany({
    where: {
      id: { not: incident.id },
      category: incident.category,
      status: { in: ["OPEN", "IN_PROGRESS"] },
      collectionRun: { dataSourceId: run.dataSourceId },
    },
    data: {
      status: "RESOLVED",
      resolutionAction: "SUPERSEDED_BY_LATER_RUN",
      resolutionReason: `Superseded by collection incident ${incident.id}`,
      resolvedAt: run.finishedAt ?? new Date(),
    },
  });

  if (retryParent && retryParent.id !== incident.id) {
    await db.collectionIncident.update({
      where: { id: retryParent.id },
      data: {
        status: "RESOLVED",
        resolutionAction: "RETRY_SUPERSEDED",
        resolutionReason: `Retry created follow-up incident ${incident.id}`,
        resolvedAt: run.finishedAt ?? new Date(),
      },
    });
  }
  return incident;
}

async function collectionRunDiagnostics(runId: string, db: Prisma.TransactionClient) {
  const [rawArtifacts, parserFailures, challengeArtifacts, sourceEvents, sourceSignals, eventLinks, signalLinks] = await Promise.all([
    db.rawArtifact.count({ where: { collectionRunId: runId } }),
    db.rawArtifact.count({ where: { collectionRunId: runId, parserFailure: true } }),
    db.rawArtifact.count({ where: { collectionRunId: runId, artifactType: { contains: "CHALLENGE" } } }),
    db.sourceEventOccurrence.count({ where: { lastCollectionRunId: runId } }),
    db.sourceMarketSignal.count({ where: { lastCollectionRunId: runId } }),
    db.eventOccurrenceSourceLink.count({ where: { sourceEventOccurrence: { lastCollectionRunId: runId } } }),
    db.marketSignalSourceLink.count({ where: { sourceMarketSignal: { lastCollectionRunId: runId } } }),
  ]);
  return { rawArtifacts, parserFailures, challengeArtifacts, sourceEvents, sourceSignals, eventLinks, signalLinks };
}

function severityFor(run: Pick<CollectionRun, "status" | "errorCode">): "P1" | "P2" | "P3" {
  if (["RATE_LIMITED", "MANUAL_REQUIRED", "PARSING_ERROR"].includes(run.errorCode ?? "")) return "P1";
  return run.status === "FAILED" ? "P2" : "P3";
}

function summaryFor(run: Pick<CollectionRun, "status" | "successCount" | "failureCount">, diagnostics: Awaited<ReturnType<typeof collectionRunDiagnostics>>) {
  if (diagnostics.challengeArtifacts) return `${diagnostics.challengeArtifacts} browser challenge artifact(s) require review`;
  if (diagnostics.parserFailures) return `${diagnostics.parserFailures} raw artifact(s) could not be parsed`;
  return `${run.status.toLowerCase()} with ${run.successCount} successful and ${run.failureCount} failed record(s)`;
}

function evidenceFor(run: CollectionRun, diagnostics: Awaited<ReturnType<typeof collectionRunDiagnostics>>): Prisma.InputJsonObject {
  return {
    runStatus: run.status,
    successCount: run.successCount,
    failureCount: run.failureCount,
    errorCode: run.errorCode,
    diagnostics,
  };
}
