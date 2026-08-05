import { getEnvironment } from "@tymra/config";
import { enqueueJob, prisma } from "@tymra/db";
import { closeRedis } from "@tymra/queue";

import { handleJob } from "./jobs/job-handlers";
import { WorkerService } from "./services/worker-service";
import { queueFailureReport } from "./operations/queue-governance";
import { executeCanary, canaryPlan, productionPreflight } from "./operations/release-safety";
import { executeQueueHistoryAction, executeReleaseRollback } from "./operations/guarded-operations";
import { loadEventReconciliation } from "./operations/event-reconciliation";

const environment = getEnvironment();
const service = new WorkerService(environment);
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case "preview":
  case "collect:listing":
    print(await service.createPreview({ input: requiredArg(args, 0), idempotencyKey: option(args, "--key") ?? `cli-preview:${Date.now()}`, locale: locale(args), deviceId: "worker-cli", ipAddress: "127.0.0.1" }));
    break;
  case "analyse":
  case "analyse:listing":
    print(await service.createFormalAnalysis({ input: requiredArg(args, 0), email: requiredOption(args, "--email"), serviceConsent: true, marketingConsent: args.includes("--marketing-consent"), idempotencyKey: option(args, "--key") ?? `cli-analysis:${Date.now()}`, locale: locale(args), deviceId: "worker-cli", ipAddress: "127.0.0.1" }));
    break;
  case "status": print(await service.getAnalysis(requiredArg(args, 0))); break;
  case "result": print(await service.getResult(requiredArg(args, 0))); break;
  case "confirm": print(await service.confirmAnalysis(requiredArg(args, 0), { sellableUnitId: requiredArg(args, 1) })); break;
  case "cancel": print(await service.cancelAnalysis(requiredArg(args, 0))); break;
  case "resend-link": print(await service.resendLink(requiredArg(args, 0))); break;
  case "collect-source": print(await service.collectSource(requiredArg(args, 0), option(args, "--market") ?? "new-zealand", undefined, collectionOptions(args))); break;
  case "source-health":
  case "source:health": print(await service.sourceHealth(args[0])); break;
  case "source:approve": print(await service.approveSource(requiredArg(args, 0))); break;
  case "source:activate": print(await service.activateSource(requiredArg(args, 0), { approvedBy: option(args, "--approved-by") ?? "Harold", licenseBasis: requiredOption(args, "--license-basis"), allowDisplay: args.includes("--allow-display") })); break;
  case "source:suspend": print(await service.suspendSource(requiredArg(args, 0))); break;
  case "schedule:eventfinda:enable": print(await service.setEventfindaSchedules(true)); break;
  case "schedule:eventfinda:disable": print(await service.setEventfindaSchedules(false)); break;
  case "schedule:ticketmaster:enable": print(await service.setTicketmasterSchedules(true)); break;
  case "schedule:ticketmaster:disable": print(await service.setTicketmasterSchedules(false)); break;
  case "collect:market": print(await service.enqueueOperationalJob("MARKET_COVERAGE_COLLECTION", { marketScope: option(args, "--market") ?? "new-zealand" })); break;
  case "collect:anchor-panel": print(await service.enqueueOperationalJob("ANCHOR_PANEL_COLLECTION", { marketScope: option(args, "--market") ?? "new-zealand" })); break;
  case "collect:rotating-panel": print(await service.enqueueOperationalJob("ROTATING_PANEL_COLLECTION", { marketScope: option(args, "--market") ?? "new-zealand" })); break;
  case "collect:events": print(await service.collectSource(option(args, "--source") ?? "eventfinda", option(args, "--market") ?? "new-zealand", undefined, { ...collectionOptions(args), phase: eventCollectionPhase(args), maxPages: integerOption(args, "--max-pages"), maxDetails: integerOption(args, "--max-details") })); break;
  case "collect:disruptions": print(await service.collectSource(option(args, "--source") ?? "geonet", option(args, "--market") ?? "new-zealand", undefined, collectionOptions(args))); break;
  case "argus:health": print(await service.argusHealth()); break;
  case "health": print(await service.health()); break;
  case "cleanup":
  case "retention:cleanup": print(await service.retentionCleanup()); break;
  case "queue:audit": {
    const jobs = await prisma.job.findMany({
      where: { status: { in: ["FAILED", "DEAD_LETTER"] } },
      select: { id: true, status: true, type: true, lastErrorCode: true, lastErrorMessage: true },
      orderBy: { createdAt: "asc" },
      take: integerOption(args, "--limit") ?? 500,
    });
    print({ ...queueFailureReport(jobs, integerOption(args, "--samples") ?? 5), mutationPerformed: false });
    break;
  }
  case "queue:history": {
    const action = requiredOption(args, "--action");
    if (!["retry", "archive", "ignore"].includes(action)) throw new Error("--action must be retry, archive or ignore");
    const expected = `${action.toUpperCase()}_JOB`;
    if (option(args, "--confirm") !== expected) throw new Error(`Queue history action requires --confirm ${expected}`);
    print({ ...await executeQueueHistoryAction(prisma, environment.ACCESS_KEY_SECRET, {
      jobId: requiredArg(args, 0), action: action as "retry" | "archive" | "ignore", reason: requiredOption(args, "--reason"),
    }), mutationPerformed: true });
    break;
  }
  case "release:preflight": {
    const requested = csvOption(args, "--sources");
    const sources = await prisma.dataSource.findMany({ where: requested.length ? { key: { in: requested } } : undefined });
    const result = productionPreflight({
      schedulerRuntimeEnabled: environment.SCHEDULER_ENABLED,
      enabledScheduleCount: await prisma.scheduleDefinition.count({ where: { enabled: true } }),
      requestedSourceKeys: requested,
      sources,
    });
    print({ ...result, checkedSources: sources.map((source) => source.key), mutationPerformed: false });
    break;
  }
  case "release:canary-plan": {
    const requested = csvOption(args, "--sources");
    if (!requested.length) throw new Error("Missing --sources");
    print({ ...canaryPlan(requested), mutationPerformed: false });
    break;
  }
  case "release:canary-run": {
    const requested = csvOption(args, "--sources");
    if (!requested.length) throw new Error("Missing --sources");
    if (option(args, "--confirm") !== "RUN_BOUNDED_CANARY") throw new Error("Canary requires --confirm RUN_BOUNDED_CANARY");
    const sourceRows = await prisma.dataSource.findMany({ where: { key: { in: requested } } });
    const preflight = productionPreflight({ schedulerRuntimeEnabled: environment.SCHEDULER_ENABLED, enabledScheduleCount: await prisma.scheduleDefinition.count({ where: { enabled: true } }), requestedSourceKeys: requested, sources: sourceRows });
    if (!preflight.ready) throw new Error(`Canary preflight failed: ${preflight.failures.join("; ")}`);
    print(await executeCanary(requested, async (sourceKey, pass) => {
      const source = sourceRows.find((item) => item.key === sourceKey)!;
      const before = await prisma.sourceEventOccurrence.count({ where: { dataSourceId: source.id } });
      try {
        const result = await service.collectSource(sourceKey, option(args, "--market") ?? "new-zealand", undefined, { limit: integerOption(args, "--limit") ?? 2, dryRun: false });
        const run = await prisma.collectionRun.findUniqueOrThrow({ where: { id: result.runId } });
        const scope = run.scope && typeof run.scope === "object" && !Array.isArray(run.scope) ? run.scope as Record<string, unknown> : {};
        const after = await prisma.sourceEventOccurrence.count({ where: { dataSourceId: source.id } });
        const parserFailures = await prisma.rawArtifact.count({ where: { collectionRunId: run.id, parserFailure: true } });
        const remoteEvidenceRemaining = await prisma.rawArtifact.count({ where: { collectionRunId: run.id, storageRef: { startsWith: "argus-evidence:" } } });
        return { sourceKey, pass, governanceUnchanged: scope.governanceUnchanged === true, schedulesUnchanged: scope.schedulesUnchanged === true, parserFailures, repeatRowGrowth: pass > 1 ? Math.max(0, after - before) : 0, remoteEvidenceRemaining };
      } catch (error) {
        return { sourceKey, pass, governanceUnchanged: false, schedulesUnchanged: false, parserFailures: 0, repeatRowGrowth: 0, remoteEvidenceRemaining: 0, error: error instanceof Error ? error.message : "unknown" };
      }
    }));
    break;
  }
  case "release:rollback": {
    if (option(args, "--confirm") !== "DISABLE_COLLECTIONS") throw new Error("Rollback requires --confirm DISABLE_COLLECTIONS");
    const result = await executeReleaseRollback(prisma, environment.ACCESS_KEY_SECRET);
    print({ ...result, mutationPerformed: true });
    break;
  }
  case "events:reconcile": {
    const sources = csvOption(args, "--sources");
    if (sources.length < 2) throw new Error("Reconciliation requires at least two --sources");
    const from = dateOption(args, "--from") ?? new Date();
    const to = dateOption(args, "--to", true) ?? new Date(from.getTime() + 31 * 86_400_000);
    print({ ...await loadEventReconciliation(prisma, { sources, from, to }), mutationPerformed: false });
    break;
  }
  case "seed:fixtures": print({ fixtureSource: await prisma.dataSource.findUnique({ where: { key: "development-demo" } }) }); break;
  case "run-job": {
    const job = await prisma.job.findUniqueOrThrow({ where: { id: requiredArg(args, 0) } });
    await handleJob(job, environment);
    print({ handled: job.id, type: job.type });
    break;
  }
  case "enqueue-source": {
    const sourceId = requiredArg(args, 0);
    print(await enqueueJob({
      type: ["eventfinda", "ticketmaster", "eventbrite_events", "humanitix_events", "school_sport_nz", "school_sport_canterbury", "ticketek_events", "christchurch_sports", "christchurch_racing", "christchurch_council_events", "canterbury_major_annual_events"].includes(sourceId)
        ? "EVENT_COLLECTION"
        : ["christchurch_airport", "christchurch_cruise", "christchurch_airport_monthly"].includes(sourceId) ? "TRANSPORT_COLLECTION" : "PUBLIC_DATA_COLLECTION",
      payload: {
        sourceId,
        marketScope: option(args, "--market") ?? "new-zealand",
        ...collectionOptions(args),
        phase: eventCollectionPhase(args),
        maxPages: integerOption(args, "--max-pages"),
        maxDetails: integerOption(args, "--max-details"),
      },
      idempotencyKey: option(args, "--key") ?? `cli-source:${sourceId}:${Date.now()}`,
      sourceId,
    }));
    break;
  }
  default:
    process.stderr.write("Usage: cli <argus:health|collect:listing|collect:market|collect:anchor-panel|collect:rotating-panel|collect:events|collect:disruptions|analyse:listing|source:health|source:approve|source:activate|source:suspend|schedule:eventfinda:enable|schedule:eventfinda:disable|schedule:ticketmaster:enable|schedule:ticketmaster:disable|retention:cleanup|queue:audit|queue:history|events:reconcile|release:preflight|release:canary-plan|release:canary-run|release:rollback|seed:fixtures> ...\n");
    process.exitCode = 2;
}

await closeRedis();
await prisma.$disconnect();

function print(value: unknown) { process.stdout.write(`${JSON.stringify(value, null, 2)}\n`); }
function requiredArg(args: string[], index: number) { const value = args[index]; if (!value || value.startsWith("--")) throw new Error(`Missing argument ${index + 1}`); return value; }
function option(args: string[], name: string) { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function requiredOption(args: string[], name: string) { const value = option(args, name); if (!value) throw new Error(`Missing ${name}`); return value; }
function csvOption(args: string[], name: string) { return (option(args, name) ?? "").split(",").map((value) => value.trim()).filter(Boolean); }
function locale(args: string[]): "en" | "zh" { return option(args, "--locale") === "zh" ? "zh" : "en"; }
function dateOption(args: string[], name: string, inclusiveEnd = false) {
  const value = option(args, name);
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${name}`);
  return inclusiveEnd && !value.includes("T") ? new Date(date.getTime() + 86_400_000) : date;
}
function integerOption(args: string[], name: string) {
  const value = option(args, name);
  if (!value) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`Invalid ${name}`);
  return parsed;
}

function collectionOptions(args: string[]) {
  return {
    from: dateOption(args, "--from"),
    to: dateOption(args, "--to", true),
    limit: integerOption(args, "--limit"),
    dryRun: args.includes("--dry-run"),
    localAcceptance: args.includes("--local-acceptance"),
    developmentBootstrap: args.includes("--development-bootstrap"),
  };
}

function eventCollectionPhase(args: string[]): "discovery" | "details" | "full" | undefined {
  const value = option(args, "--phase");
  if (!value) return undefined;
  if (["discovery", "details", "full"].includes(value)) return value as "discovery" | "details" | "full";
  throw new Error("Invalid --phase; expected discovery, details or full");
}
