import { Prisma } from "@tymra/db";

/** A later control tick may recheck rolled-back DB work; never wrap a source Job handler. */
export async function runControlCycle(service: "worker" | "scheduler", work: () => Promise<unknown>): Promise<boolean> {
  try {
    await work();
    return true;
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2028") throw error;
    process.stderr.write(`${JSON.stringify({ service: `tymra-${service}`, event: "control_transaction_interrupted", errorCode: error.code })}\n`);
    return false;
  }
}
