import type { JobStatus } from "@tymra/db";

export type QueueDisposition = "RETRY_ELIGIBLE" | "EXTERNAL_BLOCK" | "HISTORICAL_FIXTURE" | "MANUAL_REVIEW";

export function classifyQueueFailure(job: {
  status: JobStatus;
  type: string;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
}): QueueDisposition {
  const code = (job.lastErrorCode ?? "").toUpperCase();
  const message = (job.lastErrorMessage ?? "").toLowerCase();
  if (job.type === "EMAIL_DELIVERY" && /decrypt|encryption|fixture|key/.test(`${code} ${message}`.toLowerCase())) return "HISTORICAL_FIXTURE";
  if (["RIGHTS_BLOCKED", "SOURCE_UNAVAILABLE", "RATE_LIMITED", "ACCESS_CHALLENGE"].some((value) => code.includes(value))) return "EXTERNAL_BLOCK";
  if (job.status === "FAILED" && /TIMEOUT|NETWORK|LEASE|UNAVAILABLE/.test(code)) return "RETRY_ELIGIBLE";
  return "MANUAL_REVIEW";
}

export function queueFailureSummary(jobs: Array<Parameters<typeof classifyQueueFailure>[0]>) {
  const summary: Record<QueueDisposition, number> = {
    RETRY_ELIGIBLE: 0,
    EXTERNAL_BLOCK: 0,
    HISTORICAL_FIXTURE: 0,
    MANUAL_REVIEW: 0,
  };
  for (const job of jobs) summary[classifyQueueFailure(job)] += 1;
  return summary;
}
