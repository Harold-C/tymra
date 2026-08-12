import { describe, expect, it } from "vitest";

import { evaluateOperationalAlerts } from "../src/operations/operational-alerts";

const thresholds = {
  queueDepthWarning: 100,
  failedJobsCritical: 1,
  billingFailuresCritical: 1,
  captchaManual24hWarning: 5,
  schedulerOldestPendingSecondsWarning: 900,
};

describe("privacy-safe operational alerts", () => {
  it("returns no alerts below every threshold", () => {
    expect(evaluateOperationalAlerts({ databaseHealthy: true, redisHealthy: true, argusHealthy: true, queueDepth: 99, failedJobs: 0, billingFailures: 0, captchaManualRequiredLast24Hours: 4, schedulerOldestPendingAgeSeconds: 899, thresholds })).toEqual([]);
  });

  it("returns stable machine-readable alerts at each boundary", () => {
    expect(evaluateOperationalAlerts({ databaseHealthy: false, redisHealthy: false, argusHealthy: false, queueDepth: 100, failedJobs: 1, billingFailures: 1, captchaManualRequiredLast24Hours: 5, schedulerOldestPendingAgeSeconds: 900, thresholds }).map((alert) => alert.code)).toEqual([
      "DATABASE_UNHEALTHY",
      "REDIS_UNHEALTHY",
      "ARGUS_UNHEALTHY",
      "QUEUE_DEPTH_HIGH",
      "FAILED_JOBS_PRESENT",
      "BILLING_RECONCILIATION_FAILURES",
      "CAPTCHA_HANDOFF_VOLUME_HIGH",
      "MEMBERSHIP_SCHEDULER_DELAYED",
    ]);
  });

  it("does not expose identifiers or user data", () => {
    const alerts = evaluateOperationalAlerts({ databaseHealthy: true, redisHealthy: true, argusHealthy: true, queueDepth: 100, failedJobs: 0, billingFailures: 0, captchaManualRequiredLast24Hours: 0, schedulerOldestPendingAgeSeconds: null, thresholds });
    expect(JSON.stringify(alerts)).not.toMatch(/email|password|token|address|customer|property/iu);
  });
});
