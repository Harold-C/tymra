import { randomUUID } from "node:crypto";

import { getEnvironment, type Environment } from "@tymra/config";
import { hashPersonalIdentifier, prisma } from "@tymra/db";

type OperatorAction = {
  required: true;
  type: "novnc_handoff";
  issue_url: "/v1/handoffs";
  reason: "captcha" | "cloudflare" | "bot_verification";
  session_ttl_seconds: number;
  session_id: string;
  expires_at: string;
};

export type ArgusManualActionView = {
  executionId: string;
  argusJobId: string;
  connectorId: string;
  workflowId: string;
  sourceHost: string;
  reason: OperatorAction["reason"];
  expiresAt: string;
  submittedAt: string;
};

export class ArgusManualActionError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export async function listArgusManualActions(now = new Date()): Promise<ArgusManualActionView[]> {
  const executions = await prisma.argusExecution.findMany({
    where: { status: "WAITING_FOR_MANUAL" },
    orderBy: { submittedAt: "asc" },
    take: 100,
  });
  return executions.flatMap((execution) => {
    const action = operatorAction(execution.result);
    if (!action || Date.parse(action.expires_at) <= now.getTime()) return [];
    return [{
      executionId: execution.id,
      argusJobId: execution.argusJobId,
      connectorId: execution.connectorId,
      workflowId: execution.workflowId,
      sourceHost: safeSourceHost(execution.requestedUrl),
      reason: action.reason,
      expiresAt: action.expires_at,
      submittedAt: execution.submittedAt.toISOString(),
    }];
  });
}

export async function issueArgusManualHandoff(
  executionId: string,
  adminId: string,
  environment: Environment = getEnvironment(),
  now = new Date(),
): Promise<{ url: string; expiresAt: string }> {
  const execution = await prisma.argusExecution.findUnique({ where: { id: executionId } });
  if (!execution || execution.status !== "WAITING_FOR_MANUAL") {
    throw new ArgusManualActionError("MANUAL_ACTION_NOT_FOUND", "The manual browser action is no longer active.");
  }
  const action = operatorAction(execution.result);
  if (!action) throw new ArgusManualActionError("MANUAL_ACTION_INVALID", "Argus returned an invalid operator action.");
  const remainingSeconds = Math.floor((Date.parse(action.expires_at) - now.getTime()) / 1_000);
  if (remainingSeconds < 60) throw new ArgusManualActionError("MANUAL_ACTION_EXPIRED", "The manual browser session has expired.");

  const issuedTtlSeconds = Math.min(300, remainingSeconds, action.session_ttl_seconds);
  const response = await fetch(new URL(action.issue_url, environment.ARGUS_API_BASE_URL), {
    method: "POST",
    headers: {
      authorization: `Bearer ${environment.ARGUS_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      job_id: execution.argusJobId,
      session_id: action.session_id,
      ttl_seconds: issuedTtlSeconds,
    }),
    signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
  });
  const body = await response.json() as { url?: string; expires_at?: string; session_id?: string; error?: string };
  if (!response.ok) {
    throw new ArgusManualActionError("ARGUS_HANDOFF_REJECTED", `Argus rejected the handoff with HTTP ${response.status}.`);
  }
  const url = validNoVncUrl(body.url);
  const expiresAt = typeof body.expires_at === "string" ? Date.parse(body.expires_at) : Number.NaN;
  if (!url || body.session_id !== action.session_id || Number.isNaN(expiresAt) || expiresAt <= now.getTime()
    || expiresAt > Date.parse(action.expires_at) || expiresAt > now.getTime() + issuedTtlSeconds * 1_000) {
    throw new ArgusManualActionError("ARGUS_HANDOFF_INVALID", "Argus returned an invalid handoff response.");
  }
  await prisma.auditEvent.create({
    data: {
      actorAdminId: adminId,
      eventType: "argus_manual_handoff_issued",
      entityType: "ArgusExecution",
      entityId: execution.id,
      payload: { argusJobId: execution.argusJobId, connectorId: execution.connectorId, workflowId: execution.workflowId, reason: action.reason },
      eventHash: hashPersonalIdentifier(`argus-handoff:${execution.id}:${randomUUID()}`, environment.ACCESS_KEY_SECRET),
    },
  });
  return { url: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
}

function operatorAction(value: unknown): OperatorAction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>).operator_action;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const action = candidate as Record<string, unknown>;
  if (action.required !== true || action.type !== "novnc_handoff" || action.issue_url !== "/v1/handoffs") return null;
  if (!/^(captcha|cloudflare|bot_verification)$/u.test(String(action.reason))) return null;
  if (!/^manual_[a-f0-9]{32}$/u.test(String(action.session_id))) return null;
  if (typeof action.expires_at !== "string" || Number.isNaN(Date.parse(action.expires_at))) return null;
  if (!Number.isInteger(action.session_ttl_seconds) || Number(action.session_ttl_seconds) < 60 || Number(action.session_ttl_seconds) > 900) return null;
  return action as unknown as OperatorAction;
}

function validNoVncUrl(value: unknown): URL | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const allowedOrigins = new Set(["https://connect.argus.test", "https://connect.argus.nz"]);
    return allowedOrigins.has(url.origin) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function safeSourceHost(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "unknown";
  }
}
