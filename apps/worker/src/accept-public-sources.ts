import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import {
  enqueueJob,
  isTerminalJobStatus,
  prisma,
  type Job,
  type JobType,
} from "@tymra/db";

import { writeAcceptanceArtifacts } from "./operations/acceptance-artifacts";

type SourceSpec = {
  key: string;
  jobType: JobType;
  marketScope: string;
  payload?: Record<string, string | number | boolean>;
  range?: { from: string; to: string };
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
  retainedEvidenceCount: number;
  remoteEvidenceCount: number;
  lincolnSignalCount: number;
  countsBefore: SourceCounts;
  countsAfter: SourceCounts;
  newSourceRows: SourceCounts;
  configurationUnchanged: boolean;
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
  { key: "mbie", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand", payload: { limit: 100 } },
  { key: "stats_nz", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand" },
  { key: "mbie_tourism_flows", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand", payload: { limit: 250 } },
  { key: "mbie_mrte", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand", payload: { limit: 100 } },
  { key: "mbie_ivs", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand", payload: { limit: 10 } },
  { key: "venue_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "council_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "university_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "rto_calendars", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "wellingtonnz_events", jobType: "EVENT_COLLECTION", marketScope: "wellington" },
  { key: "waikatonz_events", jobType: "EVENT_COLLECTION", marketScope: "waikato" },
  { key: "queenstownnz_events", jobType: "EVENT_COLLECTION", marketScope: "queenstown-wanaka" },
  { key: "tauponz_events", jobType: "EVENT_COLLECTION", marketScope: "taupo" },
  { key: "southlandnz_events", jobType: "EVENT_COLLECTION", marketScope: "southland-fiordland" },
  { key: "hawkesbaynz_events", jobType: "EVENT_COLLECTION", marketScope: "hawkes-bay" },
  { key: "taranakienz_events", jobType: "EVENT_COLLECTION", marketScope: "taranaki" },
  { key: "nelsontasman_events", jobType: "EVENT_COLLECTION", marketScope: "nelson-tasman" },
  { key: "tauranga_events", jobType: "EVENT_COLLECTION", marketScope: "tauranga" },
  { key: "manawatunz_events", jobType: "EVENT_COLLECTION", marketScope: "manawatu" },
  { key: "northland_events", jobType: "EVENT_COLLECTION", marketScope: "northland" },
  { key: "rotoruanz_events", jobType: "EVENT_COLLECTION", marketScope: "rotorua" },
  { key: "dunedinnz_events", jobType: "EVENT_COLLECTION", marketScope: "dunedin", payload: { phase: "full", limit: 20 } },
  { key: "te_pae_events", jobType: "EVENT_COLLECTION", marketScope: "christchurch" },
  { key: "venues_otautahi_events", jobType: "EVENT_COLLECTION", marketScope: "christchurch" },
  { key: "isaac_theatre_royal_events", jobType: "EVENT_COLLECTION", marketScope: "christchurch" },
  { key: "christchurch_council_events", jobType: "EVENT_COLLECTION", marketScope: "christchurch" },
  { key: "ara_academic_dates", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "christchurch", range: { from: "2026-02-01T00:00:00.000Z", to: "2026-03-01T00:00:00.000Z" } },
  { key: "canterbury_major_annual_events", jobType: "EVENT_COLLECTION", marketScope: "christchurch", range: { from: "2026-11-01T00:00:00.000Z", to: "2026-12-01T00:00:00.000Z" } },
  { key: "eventbrite_events", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "humanitix_events", jobType: "EVENT_COLLECTION", marketScope: "new-zealand" },
  { key: "school_sport_nz", jobType: "EVENT_COLLECTION", marketScope: "christchurch", payload: { phase: "full", limit: 20 } },
  { key: "school_sport_canterbury", jobType: "EVENT_COLLECTION", marketScope: "christchurch", payload: { phase: "full", limit: 20 } },
  { key: "ticketek_events", jobType: "EVENT_COLLECTION", marketScope: "new-zealand", payload: { phase: "full", limit: 10, maxDetails: 1 } },
  { key: "metservice", jobType: "WEATHER_COLLECTION", marketScope: "new-zealand" },
  { key: "nzta", jobType: "TRANSPORT_COLLECTION", marketScope: "new-zealand" },
  { key: "doc_alerts", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand", payload: { limit: 300 } },
  { key: "interislander_alerts", jobType: "TRANSPORT_COLLECTION", marketScope: "new-zealand", payload: { limit: 20 } },
  { key: "ski_seasons_nz", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "new-zealand", payload: { limit: 3 } },
  { key: "airport_data", jobType: "TRANSPORT_COLLECTION", marketScope: "queenstown-wanaka" },
  { key: "queenstown_airport_monthly", jobType: "TRANSPORT_COLLECTION", marketScope: "queenstown-wanaka" },
  { key: "auckland_airport_monthly", jobType: "TRANSPORT_COLLECTION", marketScope: "auckland" },
  { key: "mot_airline_performance", jobType: "TRANSPORT_COLLECTION", marketScope: "new-zealand", payload: { limit: 100 } },
  { key: "wellington_airport", jobType: "TRANSPORT_COLLECTION", marketScope: "wellington" },
  { key: "wellington_airport_monthly", jobType: "TRANSPORT_COLLECTION", marketScope: "wellington" },
  { key: "christchurch_airport", jobType: "TRANSPORT_COLLECTION", marketScope: "christchurch" },
  { key: "christchurch_sports", jobType: "EVENT_COLLECTION", marketScope: "christchurch", range: annualAcceptanceWindow(1, 32) },
  { key: "christchurch_university_dates", jobType: "PUBLIC_DATA_COLLECTION", marketScope: "christchurch", range: { from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } },
  { key: "christchurch_racing", jobType: "EVENT_COLLECTION", marketScope: "christchurch" },
  { key: "christchurch_cruise", jobType: "TRANSPORT_COLLECTION", marketScope: "christchurch", range: annualAcceptanceWindow(0, 31) },
  { key: "christchurch_airport_monthly", jobType: "TRANSPORT_COLLECTION", marketScope: "christchurch", range: annualAcceptanceWindow(0, 31) },
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
  const acceptancePasses = acceptancePassCount(process.env.ACCEPTANCE_PASSES);
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
    for (const pass of Array.from({ length: acceptancePasses }, (_, index) => index + 1)) {
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
          from: spec.range?.from ?? rangeFrom.toISOString(),
          to: spec.range?.to ?? rangeTo.toISOString(),
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
      const acceptedTicketekChallenge = spec.key === "ticketek_events" && run?.status === "PARTIAL" && run.errorCode === "RATE_LIMITED";
      if (!run) {
        failures.push("No CollectionRun was created");
      } else if (run.status !== "SUCCEEDED" && !acceptedTicketekChallenge) {
        failures.push(`CollectionRun ended as ${run.status}: ${run.errorCode ?? "UNKNOWN"}`);
      }
      if (run && scope.configurationUnchanged !== true) failures.push("Source configuration changed");
      if (run && scope.schedulesUnchanged !== true) failures.push("Source schedules changed");
      const lineageFailures = lineageProblems(countsAfter);
      failures.push(...lineageFailures);

      const [artifactCount, parserFailureArtifacts, argusExecutions, retainedEvidenceCount, remoteEvidenceCount, lincolnSignalCount] = run
        ? await Promise.all([
            prisma.rawArtifact.count({ where: { collectionRunId: run.id } }),
            prisma.rawArtifact.count({ where: { collectionRunId: run.id, parserFailure: true } }),
            prisma.argusExecution.count({ where: { parentJobId: job.id } }),
            prisma.rawArtifact.count({ where: { collectionRunId: run.id, storageRef: { startsWith: "tymra-evidence:" } } }),
            prisma.rawArtifact.count({ where: { collectionRunId: run.id, storageRef: { startsWith: "argus-evidence:" } } }),
            prisma.sourceMarketSignal.count({ where: { dataSourceId: source.id, externalId: { startsWith: "lincoln:" } } }),
          ])
        : [0, 0, 0, 0, 0, 0];
      if (spec.key === "christchurch_university_dates") {
        if (argusExecutions !== 1) failures.push(`Expected one Lincoln Argus execution; found ${argusExecutions}`);
        if (retainedEvidenceCount < 1) failures.push("Lincoln Argus evidence was not retained in Tymra storage");
        if (remoteEvidenceCount !== 0) failures.push(`${remoteEvidenceCount} Lincoln artifacts still referenced remote Argus evidence after ACK`);
        if (lincolnSignalCount < 1) failures.push("No normalised Lincoln market signal was persisted");
      }
      if (["school_sport_nz", "school_sport_canterbury", "ticketek_events"].includes(spec.key)) {
        const expectedExecutions = spec.key === "ticketek_events" ? 2 : 1;
        if (argusExecutions !== expectedExecutions) failures.push(`Expected ${expectedExecutions} ${spec.key} Argus execution(s); found ${argusExecutions}`);
        if (retainedEvidenceCount < 1) failures.push(`${spec.key} Argus evidence was not retained in Tymra storage`);
        if (remoteEvidenceCount !== 0) failures.push(`${remoteEvidenceCount} ${spec.key} artifacts still referenced remote Argus evidence after ACK`);
        if (spec.key === "ticketek_events" && countsAfter.sourceOccurrences < 1) failures.push("No normalised ticketek_events event occurrence was persisted");
      }

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
        retainedEvidenceCount,
        remoteEvidenceCount,
        lincolnSignalCount,
        countsBefore,
        countsAfter,
        newSourceRows: subtractCounts(countsAfter, countsBefore),
        configurationUnchanged: scope.configurationUnchanged === true,
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
    for (const repeat of passes.slice(1)) {
      if (Object.values(repeat.newSourceRows).some((value) => value !== 0)) {
        repeat.failures.push(`Repeat pass changed source/link row counts: ${JSON.stringify(repeat.newSourceRows)}`);
      }
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
      sourceKey: "schedule-configuration",
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
  const artifacts = await writeAcceptanceArtifacts(output);
  process.stdout.write(`${JSON.stringify({ ...output, artifacts }, null, 2)}\n`);
  if (failures.length > 0) process.exitCode = 1;
}

function annualAcceptanceWindow(month: number, durationDays: number) {
  const year = new Date().getFullYear();
  const from = new Date(Date.UTC(year, month, 1));
  return { from: from.toISOString(), to: new Date(from.getTime() + durationDays * 86_400_000).toISOString() };
}

function acceptancePassCount(value: string | undefined) {
  if (!value) return 2;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 20) throw new Error("ACCEPTANCE_PASSES must be an integer from 2 to 20");
  return parsed;
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
