import { describe, expect, it } from "vitest";

import { allowedServiceExceptionActions, collectionRecoveryScopeMatches, runtimeScheduleStatus, serviceExceptionActionSchema, verifyCollectionRecovery, verifyRequestRecovery } from "../src/service-assurance";

const context = { status: "OPEN", type: "SOURCE_FAILURE", priority: "P1", blockingUser: true, customerUserId: "customer", checkStatus: "EXCEPTION", hasPublishedResult: false };
const now = new Date("2026-10-08T00:00:00Z");

describe("complete service assurance boundary", () => {
  it("rejects historical business overrides even when stored as allowed actions", () => {
    for (const action of ["ACCEPT_SUGGESTION", "SELECT_PROPERTY", "SELECT_UNIT", "EXCLUDE_COMPETITOR", "CHANGE_COMPETITOR_ROLE", "EDIT_NORMALIZED_VALUE", "LOWER_CONFIDENCE", "MARK_PARTIAL", "MARK_INSUFFICIENT", "APPROVE_AND_PUBLISH"]) {
      expect(serviceExceptionActionSchema.safeParse(action).success, action).toBe(false);
    }
  });
  it("routes ambiguous input to its owner and never offers an Admin candidate choice", () => {
    const actions = allowedServiceExceptionActions({ ...context, type: "UNIT_MATCH" });
    expect(actions).toContain("REQUEST_USER_CONFIRMATION");
    expect(actions).not.toContain("RECOLLECT");
    expect(actions).not.toContain("REANALYSE");
    expect(allowedServiceExceptionActions({ ...context, type: "PROPERTY_MATCH", customerUserId: null })).not.toContain("REQUEST_USER_CONFIRMATION");
  });
  it("does not dismiss a blocking or high-priority event", () => {
    expect(allowedServiceExceptionActions(context)).not.toContain("DISMISS");
    expect(allowedServiceExceptionActions({ ...context, priority: "P0", blockingUser: false })).not.toContain("DISMISS");
    expect(allowedServiceExceptionActions({ ...context, priority: "P3", blockingUser: false })).toContain("DISMISS");
  });
  it("does not offer mutation of closed cases", () => {
    expect(allowedServiceExceptionActions({ ...context, status: "RESOLVED" })).toEqual([]);
  });
  it("allows withdrawal only when a published version exists", () => {
    expect(allowedServiceExceptionActions(context)).not.toContain("WITHDRAW_RESULT");
    expect(allowedServiceExceptionActions({ ...context, hasPublishedResult: true })).toContain("WITHDRAW_RESULT");
  });
});

describe("recovery proof", () => {
  it("refuses a different collection phase, dates, market, query or smaller trial as recovery proof", () => {
    const original = { sourceId: "booking", marketScope: "christchurch", querySignatureHash: "query-a", from: "2026-10-09", limit: 20 };
    expect(collectionRecoveryScopeMatches(original, { requestedPhase: "details" }, { ...original, adminScheduleKey: "existing-plan" }, { phase: "details" })).toBe(true);
    for (const changed of [{ limit: 3 }, { from: "2026-10-10" }, { querySignatureHash: "query-b" }, { marketScope: "auckland" }]) expect(collectionRecoveryScopeMatches(original, { phase: "details" }, { ...original, ...changed }, { phase: "details" })).toBe(false);
    expect(collectionRecoveryScopeMatches(original, { phase: "details" }, original, { phase: "discovery" })).toBe(false);
  });
  const proof = { requestedAt: now, recoveryJobStatus: "SUCCEEDED", activePipelineJobs: 0, blockingExceptions: 0, checkStatus: "PUBLISHED", result: { status: "PUBLISHED", generatedAt: new Date(now.getTime() + 1) } };
  it("requires actual completion and a new accessible result", () => {
    expect(verifyRequestRecovery(proof).verified).toBe(true);
    expect(verifyRequestRecovery({ ...proof, recoveryJobStatus: "PENDING" }).verified).toBe(false);
    expect(verifyRequestRecovery({ ...proof, activePipelineJobs: 1 }).verified).toBe(false);
    expect(verifyRequestRecovery({ ...proof, blockingExceptions: 1 }).verified).toBe(false);
    expect(verifyRequestRecovery({ ...proof, checkStatus: "WITHDRAWN" }).verified).toBe(false);
    expect(verifyRequestRecovery({ ...proof, result: { ...proof.result, generatedAt: new Date(now.getTime() - 1) } }).verified).toBe(false);
  });
  it("does not infer restored collection from a succeeded job without the right run", () => {
    const run = { dataSourceId: "booking", status: "SUCCEEDED", finishedAt: now, errorCode: null, failureCount: 0 };
    const evidence = { incidentCreatedAt: now, sourceId: "booking", jobStatus: "SUCCEEDED", runs: [run] };
    expect(verifyCollectionRecovery(evidence).verified).toBe(true);
    expect(verifyCollectionRecovery({ ...evidence, runs: [{ ...run, dataSourceId: "other-source" }] }).verified).toBe(false);
    expect(verifyCollectionRecovery({ ...evidence, runs: [{ ...run, failureCount: 1 }] }).verified).toBe(false);
    expect(verifyCollectionRecovery({ ...evidence, runs: [{ ...run, finishedAt: new Date(now.getTime() - 1) }] }).verified).toBe(false);
  });
});

describe("running production is distinct from the bounded acceptance gate", () => {
  it("recognizes enabled production schedules as expected execution", () => {
    expect(runtimeScheduleStatus({ development: false, schedulerEnabled: true, enabledSchedules: 84 })).toBe("RUNNING");
    expect(runtimeScheduleStatus({ development: false, schedulerEnabled: false, enabledSchedules: 84 })).toBe("BLOCKED");
    expect(runtimeScheduleStatus({ development: true, schedulerEnabled: false, enabledSchedules: 0 })).toBe("DISABLED_BY_POLICY");
  });
});
