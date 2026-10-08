import { z } from "zod";
import { runExceptionAction } from "./admin-operations";

const schema = z.object({
  exceptionId: z.string().trim().min(1).max(120),
  action: z.enum(["RECOLLECT", "REANALYSE"]),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export class InternalOnDemandError extends Error {
  constructor(public readonly code: string, message: string, public readonly statusCode = 409) { super(message); }
}

/** Compatibility route for incident recovery; business requests belong to their customer. */
export async function createInternalOnDemandRequest(admin: { id: string; email: string }, inputValue: unknown) {
  const input = schema.parse(inputValue);
  return runExceptionAction(input.exceptionId, admin.id, { action: input.action, reason: input.reason, payload: {} });
}
