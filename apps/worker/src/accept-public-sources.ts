import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import {
  enqueueJob,
  isTerminalJobStatus,
  prisma,
  type Job,
  type JobType,
} from "@tymra/db";

type SourceSpec = {
  key: string;
  jobType: JobType;
  marketScope: string;
  payload?: Record<string, string | number | boolean>;
};

type SourceCounts = {
  sourceSignals: number;
  signalLinks: number;
  sourceEvents: number;
  eventLinks: number;
  sourceOccurrences: number;
  occurrenceLinks: number;
};

type PassReport = {
  pass: number;
  jobId: string;
  jobStatus: Job["status"];
  jobAttemptCount: number;
  runId: string | null;
  runStatus: string | null;
  errorCode: string | null;
  errorSummary: string | null;
  counters: Record<string, unknown>;
  artifactCount: number;
  parserFailureArtifacts: number;
  argusExecutions: number;
  countsBefore: SourceCounts;
  countsAfter: SourceCounts;
  newSourceRows: SourceCounts;
  governanceUnchanged: boolean;
  schedulesUnchanged: boolean;
  failures: string[];
};

type SourceReport = {
  sourceKey: string;
  sourceId: string;
  passes: PassReport[];
  secondPassNewRows: SourceCounts;
  passed: boolean;
};

const sources: SourceSpec[] = [
  { key: "public_holidays_nz", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "school_holidays_nz", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "geonet", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "linz", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "mbie", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "stats_nz", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "venue_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "council_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "university_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "rto_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "metservice", jobType: "WEATHER_COLLECTION", marketScope: "new-zealand" },
  { key: "nzta", jobType: "TRANSPORT_COLLECTION", marketScope: "new-zealand" },
  { key: "airport_data", jobType: "TRANSPORT_COLLECTION", marketScope: "queenstown" },
  { key: "port_and_cruise", jobType: "TRANSPORT_COLLECTION", marketScope: "auckland" },
  { key: "fx_rates", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  {
    key: "eventfinda",
    jobType: "EVENT_COLLECTION",
    marketScope: "new-zealand",
    payload: { phase: "discovery", maxPages: 1, maxDetails: 2 },
  },
  {
    key: "ticketmaster",
    jobType: "EVENT_COLLECTION",
    marketScope: "new-zealand",
    payload: { phase: "discovery", maxPages: 1, maxDetails: 2 },
  },
];

const zeroCounts: SourceCounts = {
  sourceSignals: 0,
  signalLinks: 0,
  sourceEvents: 0,
  eventLinks: 0,
  sourceOccurrences: 0,
  occurrenceLinks: 0,
};

async function main() {
  const environment = getEnvironment();
  if (environment.NODE_ENV !== "development") {
    throw new Error("Public-source acceptance is restricted to NODE_ENV=development");
  }
  if (environment.SCHEDULER_ENABLED) {
    throw new Error("Disable the scheduler before running public-source acceptance");
  }

  const startedAt = new Date();
  const rangeFrom = startedAt;
  const rangeTo = new Date(startedAt.getTime() + 31 * 86_400_000);
  const acceptanceId = `public-sources-${startedAt.toISOString()}-${randomUUID().slice(0, 8)}`;
  const requestedSourceKeys = new Set((process.env.ACCEPTANCE_SOURCES ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  const selectedSources = requestedSourceKeys.size
    ? sources.filter((source) => requestedSourceKeys.has(source.key))
    : sources;
  const unknownSourceKeys = [...requestedSourceKeys].filter((key) => !sources.some((source) => source.key === key));
  if (unknownSourceKeys.length > 0) throw new Error(`Unknown acceptance sources: ${unknownSourceKeys.join(", ")}`);
  if (selectedSources.length === 0) throw new Error("No public sources were selected for acceptance");
  const enabledSchedulesBefore = await prisma.scheduleDefinition.count({ where: { enabled: true } });
  if (enabledSchedulesBefore !== 0) {
    throw new Error(`Expected every schedule to be disabled; found ${enabledSchedulesBefore} enabled`);
  }

  const reports: SourceReport[] = [];
  for (const spec of selectedSources) {
    const source = await prisma.dataSource.findUniqueOrThrow({ where: { key: spec.key } });
    const passes: PassReport[] = [];
    for (const pass of [1, 2]) {
      const countsBefore = await sourceCounts(source.id);
      const job = await enqueueJob({
        type: spec.jobType,
        sourceId: source.id,
        maxAttempts: 1,
        payload: {
          sourceId: spec.key,
          marketScope: spec.marketScope,
          localAcceptance: true,
          dryRun: false,
          limit: 2,
          from: rangeFrom.toISOString(),
          to: rangeTo.toISOString(),
          ...spec.payload,
        },
        idempotencyKey: `acceptance:${acceptanceId}:${spec.key}:pass-${pass}`,
      });
      const terminalJob = await waitForTerminalJob(job.id);
      const run = await prisma.collectionRun.findFirst({
        where: { jobId: job.id },
        orderBy: { createdAt: "desc" },
      });
      const countsAfter = await sourceCounts(source.id);
      const failures: string[] = [];
      const scope = jsonRecord(run?.scope);
      const counters = jsonRecord(scope.counters);
      if (terminalJob.status !== "SUCCEEDED") {
        failures.push(`Job ended as ${terminalJob.status}: ${terminalJob.lastErrorCode ?? "UNKNOWN"}`);
      }
      if (!run) {
        failures.push("No CollectionRun was created");
      } else if (run.status !== "SUCCEEDED") {
        failures.push(`CollectionRun ended as ${run.status}: ${run.errorCode ?? "UNKNOWN"}`);
      }
      if (run && scope.governanceUnchanged !== true) failures.push("Source governance changed");
      if (run && scope.schedulesUnchanged !== true) failures.push("Source schedules changed");
      const lineageFailures = lineageProblems(countsAfter);
      failures.push(...lineageFailures);

      const [artifactCount, parserFailureArtifacts, argusExecutions] = run
        ? await Promise.all([
            prisma.rawArtifact.count({ where: { collectionRunId: run.id } }),
            prisma.rawArtifact.count({ where: { collectionRunId: run.id, parserFailure: true } }),
            prisma.argusExecution.count({ where: { parentJobId: job.id } }),
          ])
        : [0, 0, 0];

      const report: PassReport = {
        pass,
        jobId: job.id,
        jobStatus: terminalJob.status,
        jobAttemptCount: terminalJob.attemptCount,
        runId: run?.id ?? null,
        runStatus: run?.status ?? null,
        errorCode: run?.errorCode ?? terminalJob.lastErrorCode,
        errorSummary: run?.errorSummary ?? terminalJob.lastErrorMessage,
        counters,
        artifactCount,
        parserFailureArtifacts,
        argusExecutions,
        countsBefore,
        countsAfter,
        newSourceRows: subtractCounts(countsAfter, countsBefore),
        governanceUnchanged: scope.governanceUnchanged === true,
        schedulesUnchanged: scope.schedulesUnchanged === true,
        failures,
      };
      passes.push(report);
      process.stderr.write(`${JSON.stringify({
        event: "acceptance_pass_completed",
        sourceKey: spec.key,
        pass,
        jobStatus: report.jobStatus,
        runStatus: report.runStatus,
        failures,
      })}\n`);
    }

    const secondPassNewRows = passes[1]?.newSourceRows ?? zeroCounts;
    const secondPassGrowth = Object.values(secondPassNewRows).some((value) => value !== 0);
    if (secondPassGrowth) {
      passes[1]?.failures.push(`Second pass changed source/link row counts: ${JSON.stringify(secondPassNewRows)}`);
    }
    reports.push({
      sourceKey: spec.key,
      sourceId: source.id,
      passes,
      secondPassNewRows,
      passed: passes.every((pass) => pass.failures.length === 0),
    });
  }

  const enabledSchedulesAfter = await prisma.scheduleDefinition.count({ where: { enabled: true } });
  const activeAcceptanceExecutions = await prisma.argusExecution.count({
    where: {
      parentJobId: { in: reports.flatMap((report) => report.passes.map((pass) => pass.jobId)) },
      status: { in: ["SUBMITTED", "RUNNING", "CANCEL_REQUESTED"] },
    },
  });
  const failures = reports
    .filter((report) => !report.passed)
    .map((report) => ({
      sourceKey: report.sourceKey,
      failures: report.passes.flatMap((pass) => pass.failures.map((failure) => `pass ${pass.pass}: ${failure}`)),
    }));
  if (enabledSchedulesAfter !== enabledSchedulesBefore) {
    failures.push({
      sourceKey: "schedule-governance",
      failures: [`Enabled schedule count changed from ${enabledSchedulesBefore} to ${enabledSchedulesAfter}`],
    });
  }
  if (activeAcceptanceExecutions !== 0) {
    failures.push({
      sourceKey: "argus-executions",
      failures: [`${activeAcceptanceExecutions} acceptance Argus executions remained active`],
    });
  }

  const finishedAt = new Date();
  const output = {
    acceptanceId,
    startedAt,
    finishedAt,
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sourceCount: selectedSources.length,
    passCount: reports.reduce((sum, report) => sum + report.passes.length, 0),
    enabledSchedulesBefore,
    enabledSchedulesAfter,
    activeAcceptanceExecutions,
    passed: failures.length === 0,
    failures,
    reports,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

async function waitForTerminalJob(jobId: string): Promise<Job> {
  const deadline = Date.now() + 6 * 60_000;
  while (Date.now() < deadline) {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    if (isTerminalJobStatus(job.status)) return job;
    await wait(500);
  }
  throw new Error(`Acceptance Job ${jobId} did not finish within six minutes`);
}

async function sourceCounts(dataSourceId: string): Promise<SourceCounts> {
  const [
    sourceSignals,
    signalLinks,
    sourceEvents,
    eventLinks,
    sourceOccurrences,
    occurrenceLinks,
  ] = await Promise.all([
    prisma.sourceMarketSignal.count({ where: { dataSourceId } }),
    prisma.marketSignalSourceLink.count({ where: { sourceMarketSignal: { dataSourceId } } }),
    prisma.sourceEvent.count({ where: { dataSourceId } }),
    prisma.eventSourceLink.count({ where: { sourceEvent: { dataSourceId } } }),
    prisma.sourceEventOccurrence.count({ where: { dataSourceId } }),
    prisma.eventOccurrenceSourceLink.count({ where: { sourceEventOccurrence: { dataSourceId } } }),
  ]);
  return { sourceSignals, signalLinks, sourceEvents, eventLinks, sourceOccurrences, occurrenceLinks };
}

function subtractCounts(after: SourceCounts, before: SourceCounts): SourceCounts {
  return {
    sourceSignals: after.sourceSignals - before.sourceSignals,
    signalLinks: after.signalLinks - before.signalLinks,
    sourceEvents: after.sourceEvents - before.sourceEvents,
    eventLinks: after.eventLinks - before.eventLinks,
    sourceOccurrences: after.sourceOccurrences - before.sourceOccurrences,
    occurrenceLinks: after.occurrenceLinks - before.occurrenceLinks,
  };
}

function lineageProblems(counts: SourceCounts): string[] {
  const failures: string[] = [];
  if (counts.signalLinks !== counts.sourceSignals) {
    failures.push(`Signal lineage mismatch: ${counts.sourceSignals} source rows / ${counts.signalLinks} links`);
  }
  if (counts.eventLinks !== counts.sourceEvents) {
    failures.push(`Event lineage mismatch: ${counts.sourceEvents} source rows / ${counts.eventLinks} links`);
  }
  if (counts.occurrenceLinks !== counts.sourceOccurrences) {
    failures.push(`Occurrence lineage mismatch: ${counts.sourceOccurrences} source rows / ${counts.occurrenceLinks} links`);
  }
  return failures;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

await main().finally(async () => {
  await prisma.$disconnect();
});
