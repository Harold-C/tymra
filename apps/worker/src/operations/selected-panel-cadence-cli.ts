import { createHmac } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma, Prisma } from "@tymra/db";
import { addNzCalendarDays, nzDateKey } from "@tymra/domain";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedHash } from "./selected-panel-plan";

const environment = getEnvironment();
const [operation, expectedManifestHash, startsOn] = process.argv.slice(2);
try {
  if (environment.NODE_ENV !== "production" || new URL(environment.ARGUS_API_BASE_URL).hostname !== "api.argus.nz"
    || operation !== "configure" || !expectedManifestHash || startsOn !== nzDateKey(new Date()))
    throw Error("Use configure <verified-manifest-hash> <today-NZ-date> in the verified production image");
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ScheduleDefinition" WHERE key=${SELECTED_PANEL_KEY} FOR UPDATE`;
    const control = await tx.scheduleDefinition.findUniqueOrThrow({ where: { key: SELECTED_PANEL_KEY } });
    const state = selectedStateSchema.parse(control.payload);
    if (state.cadence || state.manifestHash !== expectedManifestHash || state.manifest.members.length !== 68 || !control.enabled)
      throw Error("Unexpected plan or cadence already configured; do not rearm");
    if (await tx.job.count({ where: { queueName: SELECTED_PANEL_QUEUE, status: { in: ["PENDING", "RUNNING"] } } }))
      throw Error("Wait for this plan's existing jobs to finish; never cancel or retry them");
    const schedules = await tx.scheduleDefinition.findMany({ where: { key: { not: SELECTED_PANEL_KEY } }, orderBy: { key: "asc" } });
    const sources = await tx.dataSource.findMany({ orderBy: { key: "asc" } });
    const historical = await tx.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE }, orderBy: { id: "asc" } });
    const cadence = { version: "dual-window-weekly-v2" as const, startsOn, bookingBootstrapDaily: 24 as const, bookingSteadyDaily: 20 as const };
    const updated = selectedStateSchema.parse({ ...state, cadence });
    await tx.scheduleDefinition.update({ where: { id: control.id }, data: { payload: updated as unknown as Prisma.InputJsonValue } });
    if (selectedHash(schedules) !== selectedHash(await tx.scheduleDefinition.findMany({ where: { key: { not: SELECTED_PANEL_KEY } }, orderBy: { key: "asc" } }))
      || selectedHash(sources) !== selectedHash(await tx.dataSource.findMany({ orderBy: { key: "asc" } }))
      || selectedHash(historical) !== selectedHash(await tx.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE }, orderBy: { id: "asc" } })))
      throw Error("Unrelated controls or historical jobs changed");
    const payload = { manifestHash: state.manifestHash, cadence, bootstrapEndsOn: addNzCalendarDays(startsOn, 7),
      members: 68, held: state.held, stoppedSources: state.stoppedSources, nextRunAt: control.nextRunAt,
      otherSchedulesHash: selectedHash(schedules), sourcesHash: selectedHash(sources), historicalJobsHash: selectedHash(historical),
      authorization: "User authorized dual-window rotation, Booking first-week capacity, weekly coverage and production deployment; other plans unchanged" };
    const audit = await tx.auditEvent.create({ data: { eventType: "selected_sample_weekly_cadence_configured", entityType: "ScheduleDefinition", entityId: control.id,
      payload: payload as unknown as Prisma.InputJsonValue, eventHash: createHmac("sha256", environment.ACCESS_KEY_SECRET).update(JSON.stringify(payload)).digest("hex") } });
    return { status: "passed", ...payload, auditId: audit.id };
  }, { timeout: 20000, isolationLevel: "RepeatableRead" });
  console.log(JSON.stringify(result));
} finally { await prisma.$disconnect(); }
