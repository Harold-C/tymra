export type OperationalAlert = {
  code: string;
  severity: "WARNING" | "CRITICAL";
  value: number;
  threshold: number;
};

export function evaluateOperationalAlerts(input: {
  databaseHealthy: boolean;
  redisHealthy: boolean;
  argusHealthy: boolean;
  queueDepth: number;
  failedJobs: number;
  billingFailures: number;
  captchaManualRequiredLast24Hours: number;
  schedulerOldestPendingAgeSeconds: number | null;
  thresholds: {
    queueDepthWarning: number;
    failedJobsCritical: number;
    billingFailuresCritical: number;
    captchaManual24hWarning: number;
    schedulerOldestPendingSecondsWarning: number;
  };
}): OperationalAlert[] {
  const alerts: OperationalAlert[] = [];
  if (!input.databaseHealthy) alerts.push({ code: "DATABASE_UNHEALTHY", severity: "CRITICAL", value: 1, threshold: 0 });
  if (!input.redisHealthy) alerts.push({ code: "REDIS_UNHEALTHY", severity: "CRITICAL", value: 1, threshold: 0 });
  if (!input.argusHealthy) alerts.push({ code: "ARGUS_UNHEALTHY", severity: "CRITICAL", value: 1, threshold: 0 });
  if (input.queueDepth >= input.thresholds.queueDepthWarning) alerts.push({ code: "QUEUE_DEPTH_HIGH", severity: "WARNING", value: input.queueDepth, threshold: input.thresholds.queueDepthWarning });
  if (input.failedJobs >= input.thresholds.failedJobsCritical) alerts.push({ code: "FAILED_JOBS_PRESENT", severity: "CRITICAL", value: input.failedJobs, threshold: input.thresholds.failedJobsCritical });
  if (input.billingFailures >= input.thresholds.billingFailuresCritical) alerts.push({ code: "BILLING_RECONCILIATION_FAILURES", severity: "CRITICAL", value: input.billingFailures, threshold: input.thresholds.billingFailuresCritical });
  if (input.captchaManualRequiredLast24Hours >= input.thresholds.captchaManual24hWarning) alerts.push({ code: "CAPTCHA_HANDOFF_VOLUME_HIGH", severity: "WARNING", value: input.captchaManualRequiredLast24Hours, threshold: input.thresholds.captchaManual24hWarning });
  if (input.schedulerOldestPendingAgeSeconds !== null && input.schedulerOldestPendingAgeSeconds >= input.thresholds.schedulerOldestPendingSecondsWarning) {
    alerts.push({ code: "MEMBERSHIP_SCHEDULER_DELAYED", severity: "WARNING", value: input.schedulerOldestPendingAgeSeconds, threshold: input.thresholds.schedulerOldestPendingSecondsWarning });
  }
  return alerts;
}
