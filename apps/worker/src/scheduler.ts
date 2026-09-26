import { getEnvironment } from "@tymra/config";
import { enqueueJob, prisma, type Prisma } from "@tymra/db";
import { automaticSchedulingAllowed, sourceCollectionBlockers } from "./operations/source-access";
import { firstPublicPriorJobAction, isFirstPublicSchedule } from "./operations/production-public-schedules";
import { isProductionPublicPilotSchedule } from "./operations/production-public-pilot";

const environment = getEnvironment();
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

const schedulingAllowed = automaticSchedulingAllowed(environment.NODE_ENV, environment.SCHEDULER_ENABLED);
process.stdout.write(`${JSON.stringify({ service: "tymra-scheduler", event: "scheduler_started", enabled: schedulingAllowed, configuredEnabled: environment.SCHEDULER_ENABLED, environment: environment.NODE_ENV })}\n`);

while (!stopping) {
  if (schedulingAllowed) await enqueueDueSchedules();
  await wait(30_000);
}

await prisma.$disconnect();

async function enqueueDueSchedules(now = new Date()) {
  const schedules = await prisma.scheduleDefinition.findMany({ where: { enabled: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] }, orderBy: { key: "asc" } });
  for (const schedule of schedules) {
    const publicPilot = isProductionPublicPilotSchedule(schedule);
    if (environment.NODE_ENV === "production" && !isFirstPublicSchedule(schedule) && !publicPilot) {
      throw new Error(`Production scheduler found an unapproved enabled schedule: ${schedule.key}`);
    }
    if (environment.NODE_ENV === "production") {
      const latestJob = await prisma.job.findFirst({
        where: { idempotencyKey: { startsWith: `schedule:${schedule.key}:` } },
        orderBy: { createdAt: "desc" },
        select: { status: true },
      });
      const action = firstPublicPriorJobAction(latestJob?.status);
      if (action === "PAUSE") {
        await prisma.scheduleDefinition.update({ where: { id: schedule.id }, data: { enabled: false, nextRunAt: null } });
        process.stdout.write(`${JSON.stringify({ service: "tymra-scheduler", event: "source_schedule_paused_after_job_failure", schedule: schedule.key })}\n`);
        continue;
      }
      if (action === "WAIT") continue;
    }
    if (!environment.HIGH_FREQUENCY_SCHEDULER_ENABLED && schedule.key.includes("high-frequency")) continue;
    const payload = schedule.payload as Prisma.JsonObject;
    if (typeof payload.sourceId === "string") {
      const source = await prisma.dataSource.findUnique({ where: { key: payload.sourceId } });
      const blockers = source ? sourceCollectionBlockers(source, environment.NODE_ENV) : ["source missing"];
      const metadata = source?.metadata;
      const pilotApproved = !publicPilot || (source?.providerType === "PUBLIC" && !source.isDemo
        && source.environments.includes("PRODUCTION")
        && typeof metadata === "object" && metadata !== null && !Array.isArray(metadata)
        && (metadata as Record<string, unknown>).boundedProductionCanary === true);
      if (publicPilot && (blockers.length || !pilotApproved)) {
        await prisma.scheduleDefinition.update({ where: { id: schedule.id }, data: { enabled: false, nextRunAt: null } });
        process.stdout.write(`${JSON.stringify({ service: "tymra-scheduler", event: "public_pilot_paused_after_source_block", schedule: schedule.key })}\n`);
        continue;
      }
      if (blockers.length) continue;
    }
    const intervalMs = intervalMsFor(schedule.cronExpression);
    const bucket = Math.floor(now.getTime() / intervalMs);
    await enqueueJob({ type: schedule.jobType, queueName: schedule.queueName, payload: schedule.payload as Prisma.InputJsonValue, idempotencyKey: `schedule:${schedule.key}:${bucket}`, runAt: now, sourceId: typeof payload.sourceId === "string" ? payload.sourceId : undefined, maxAttempts: environment.NODE_ENV === "production" ? 1 : undefined });
    await prisma.scheduleDefinition.update({ where: { id: schedule.id }, data: { lastEnqueuedAt: now, nextRunAt: new Date(now.getTime() + intervalMs) } });
  }
}

function wait(milliseconds: number) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

function intervalMsFor(expression: string) {
  if (expression === "weekly") return 7 * 86_400_000;
  if (expression === "daily") return 86_400_000;
  const match = expression.match(/^every-(\d+)-(minutes|hours)$/);
  if (!match) throw new Error(`Unsupported schedule expression: ${expression}`);
  const value = Number(match[1]);
  return value * (match[2] === "hours" ? 3_600_000 : 60_000);
}
