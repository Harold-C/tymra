import { Prisma } from "@tymra/db";

type DiscoveryRun = {
  jobId?: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  status: string;
  successCount: number;
  failureCount: number;
  scope: unknown;
};

export function positiveOtaListingEvidenceWhere(dataSourceId: string, cutoff: Date, runs: readonly DiscoveryRun[], now = new Date()): Prisma.ListingWhereInput {
  const discoveryJobs = [...new Set(runs.filter(run =>
    run.status === "SUCCEEDED" && run.successCount > 0 && run.failureCount === 0
    && run.createdAt instanceof Date && run.createdAt >= cutoff && run.createdAt <= now
    && run.finishedAt instanceof Date && run.finishedAt >= run.createdAt && run.finishedAt <= now
    && typeof run.jobId === "string" && run.jobId.length > 0
    && (run.scope as { operation?: unknown } | null)?.operation === "NATIONAL_CATALOG_DISCOVERY",
  ).map(run => run.jobId!))];
  return {
    dataSourceId, isDemo: false, metadata: { path: ["discoveredFor"], not: Prisma.AnyNull },
    OR: [
      { lastConfirmedAt: { gte: cutoff } },
      // A fresh successful list capture can reuse its unchanged, still-valid detail
      // identity. Keep the original identity time and require the exact current job.
      ...(discoveryJobs.length ? [{
        lastConfirmedAt: { gte: new Date(now.getTime() - 7 * 86_400_000), lte: now },
        OR: discoveryJobs.map(jobId => ({ metadata: { path: ["productionOtaJobId"], equals: jobId } })),
      }] : []),
    ],
  };
}
