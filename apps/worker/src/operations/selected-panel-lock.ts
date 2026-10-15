import type { Prisma } from "@tymra/db";
import { SELECTED_PANEL_KEY } from "./selected-panel-plan";

export async function acquireSelectedActivationLock(tx: Prisma.TransactionClient) {
  // Prisma cannot deserialize PostgreSQL's void return from the lock function.
  await tx.$queryRaw`SELECT true AS locked FROM pg_advisory_xact_lock(hashtext(${SELECTED_PANEL_KEY}))`;
}
