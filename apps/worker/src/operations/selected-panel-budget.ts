import { prisma, type Prisma } from "@tymra/db";
import { nzStartOfDay } from "@tymra/domain";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema } from "./selected-panel-plan";

/** Only the explicitly upgraded Booking panel has its own allowance. Never expand other plans. */
export async function legacyOtaDailyWhere(dataSourceId: string, sourceKey: string, now: Date,
  db: Pick<Prisma.TransactionClient, "scheduleDefinition" | "job"> = prisma): Promise<Prisma.ArgusExecutionWhereInput> {
  const where: Prisma.ArgusExecutionWhereInput = { dataSourceId, submittedAt: { gte: nzStartOfDay(now) } };
  if (sourceKey !== "booking") return where;
  const control = await db.scheduleDefinition.findUnique({ where: { key: SELECTED_PANEL_KEY } });
  const state = selectedStateSchema.safeParse(control?.payload);
  if (!state.success || !state.data.cadence) return where;
  const jobs = await db.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE, sourceId: "booking",
    createdAt: { gte: nzStartOfDay(now) } }, select: { id: true, payload: true } });
  const ids = jobs.filter(j => selectedJobSchema.safeParse(j.payload).success).map(j => j.id);
  return ids.length ? { ...where, parentJobId: { notIn: ids } } : where;
}
