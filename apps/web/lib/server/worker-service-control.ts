import { createHash } from "node:crypto";
import { getEnvironment, type Environment } from "@tymra/config";
import { hashOpaqueToken, prisma } from "@tymra/db";
import { otaServiceCommandSchema } from "@tymra/domain";
import { ServiceRecoveryError } from "./service-recovery";

export async function sendOtaServiceCommand(input: { adminId: string; commandId: string; action: "TRIAL" | "RESUME_SOURCE" | "ENABLE_SCHEDULE" | "ENABLE_PUBLIC_SCHEDULE"; sourceKey: string; scheduleKey?: string; reason: string }, environment: Environment = getEnvironment()) {
  const command = otaServiceCommandSchema.parse({ ...input, timestamp: Date.now() });
  const body = JSON.stringify(command);
  if (!environment.WORKER_INTERNAL_URL) throw new ServiceRecoveryError("WORKER_CONTROL_UNAVAILABLE", 503);
  try {
    const response = await fetch(`${environment.WORKER_INTERNAL_URL}/worker/service-control/ota`, { method: "POST", headers: { "content-type": "application/json", "x-service-signature": hashOpaqueToken(`tymra-service-command-v1:${body}`, environment.SESSION_SECRET) }, body, cache: "no-store", signal: AbortSignal.timeout(12000) });
    const result = await response.json() as { error?: string };
    if (!response.ok) throw new ServiceRecoveryError(result.error ?? "OTA_GATE_REJECTED", response.status);
    return result;
  } catch(error) {
    const persisted = await prisma.serviceOperation.findUnique({ where: { id: command.commandId } });
    const requestHash = createHash("sha256").update(JSON.stringify({ ...command, timestamp: 0 })).digest("hex");
    if (persisted?.actorAdminId === command.adminId && persisted.requestHash === requestHash) return persisted.response;
    if (error instanceof ServiceRecoveryError) throw error;
    throw new ServiceRecoveryError("WORKER_CONTROL_OUTCOME_UNVERIFIED", 503);
  }
}
