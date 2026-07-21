import { getEnvironment } from "@tymra/config";
import { enqueueJob, prisma, type Prisma } from "@tymra/db";

const environment = getEnvironment();
let stopping = false;

process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

process.stdout.write(`${JSON.stringify({ service: "tymra-scheduler", event: "scheduler_started", enabled: environment.SCHEDULER_ENABLED })}\n`);

while (!stopping) {
  if (environment.SCHEDULER_ENABLED) await enqueueDueSchedules();
  await wait(30_000);
}

await prisma.$disconnect();

async function enqueueDueSchedules(now = new Date()) {
  const schedules = await prisma.scheduleDefinition.findMany({ where: { enabled: true, OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }] }, orderBy: { key: "asc" } });
  for (const schedule of schedules) {
    if (!environment.HIGH_FREQUENCY_SCHEDULER_ENABLED && schedule.key.includes("high-frequency")) continue;
    const payload = schedule.payload as Prisma.JsonObject;
    if (typeof payload.sourceId === "string") {
      const source = await prisma.dataSource.findUnique({ where: { key: payload.sourceId } });
      if (!source?.enabled || source.internalApprovalStatus !== "APPROVED" || source.legalRightsStatus !== "ALLOWED" || !source.rightsAllowStorage || !source.rightsAllowDerivedAnalysis) continue;
    }
    const intervalMs = intervalMsFor(schedule.cronExpression);
    const bucket = Math.floor(now.getTime() / intervalMs);
    await enqueueJob({ type: schedule.jobType, queueName: schedule.queueName, payload: schedule.payload as Prisma.InputJsonValue, idempotencyKey: `schedule:${schedule.key}:${bucket}`, runAt: now, sourceId: typeof payload.sourceId === "string" ? payload.sourceId : undefined });
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
