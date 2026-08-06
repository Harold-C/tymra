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
  if (["SOURCE_UNAVAILABLE", "RATE_LIMITED", "ACCESS_CHALLENGE"].some((value) => code.includes(value))) return "EXTERNAL_BLOCK";
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

export function queueFailureReport<T extends Parameters<typeof classifyQueueFailure>[0] & { id: string }>(jobs: T[], sampleLimit = 5) {
  const groups = (Object.keys(queueFailureSummary([])) as QueueDisposition[]).map((disposition) => {
    const matching = jobs.filter((job) => classifyQueueFailure(job) === disposition);
    const errorCodes = [...new Set(matching.map((job) => job.lastErrorCode ?? "UNKNOWN"))].sort();
    return {
      disposition,
      count: matching.length,
      sampleJobIds: matching.slice(0, sampleLimit).map((job) => job.id),
      errorCodes,
      recommendation: recommendation(disposition),
    };
  });
  return { total: jobs.length, summary: queueFailureSummary(jobs), groups };
}

function recommendation(disposition: QueueDisposition) {
  if (disposition === "RETRY_ELIGIBLE") return "Retry only after confirming the transient dependency has recovered.";
  if (disposition === "EXTERNAL_BLOCK") return "Keep stopped until rate limits or source access are resolved.";
  if (disposition === "HISTORICAL_FIXTURE") return "Archive legacy fixture failures; do not replay against current keys.";
  return "Review payload and evidence manually before choosing retry or ignore.";
}
