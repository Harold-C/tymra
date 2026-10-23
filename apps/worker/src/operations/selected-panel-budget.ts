import { prisma, type Prisma } from "@tymra/db";
import { nzStartOfDay } from "@tymra/domain";
import { SELECTED_PANEL_KEY, SELECTED_PANEL_QUEUE, selectedStateSchema, selectedJobSchema } from "./selected-panel-plan";

/** Selected-roster traffic must not spend another plan's source allowance, on any channel. */
export async function legacyOtaDailyWhere(dataSourceId: string, sourceKey: string, now: Date,
  db: Pick<Prisma.TransactionClient, "scheduleDefinition" | "job"> = prisma): Promise<Prisma.ArgusExecutionWhereInput> {
  const where: Prisma.ArgusExecutionWhereInput = { dataSourceId, submittedAt: { gte: nzStartOfDay(now) } };
  const control = await db.scheduleDefinition.findUnique({ where: { key: SELECTED_PANEL_KEY } });
  const state = selectedStateSchema.safeParse(control?.payload);
  if (!state.success) return where;
  const jobs = await db.job.findMany({ where: { queueName: SELECTED_PANEL_QUEUE, sourceId: sourceKey,
    createdAt: { gte: new Date(now.getTime() - 28 * 86_400_000) } }, select: { id: true, payload: true } });
  const ids = jobs.filter(j => {
    const parsed = selectedJobSchema.safeParse(j.payload);
    return parsed.success && parsed.data.sourceId === sourceKey;
  }).map(j => j.id);
  return ids.length ? { ...where, parentJobId: { notIn: ids } } : where;
}
