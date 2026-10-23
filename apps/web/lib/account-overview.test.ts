import { describe, expect, it } from "vitest";
import { accountDate, membershipStatus, nextAccountAction, renewalCancellationMessage } from "./account-overview";
import type { CheckListItem, MembershipSummary } from "../components/member/contracts";

const summary = {
  plan: "FREE", status: "ACTIVE", serviceable: true, collectionBlockReason: null,
  usage: { remainingSpotChecks: 1 }, pricingUnits: [],
} as unknown as MembershipSummary;
const unit = { id: "owned-unit", active: true, occupiesSlot: true, verificationStatus: "PENDING_OTA_VERIFICATION" } as MembershipSummary["pricingUnits"][number];

describe("account next action", () => {
  it("prioritises verification and account restrictions over available allowance", () => {
    expect(nextAccountAction(summary, [], false).kind).toBe("verify");
    expect(nextAccountAction({ ...summary, collectionBlockReason: "MEMBERSHIP_REVIEW_REQUIRED", serviceable: false }, [], true).kind).toBe("review");
    expect(nextAccountAction({ ...summary, serviceable: false }, [], true).kind).toBe("billing");
  });
  it("continues existing work even when it has consumed the last allowance", () => {
    const check = { id: "owned-check", status: "QUEUED" } as CheckListItem;
    expect(nextAccountAction({ ...summary, usage: { ...summary.usage, remainingSpotChecks: 0 } }, [check], true)).toEqual({ kind: "processing", id: check.id });
    expect(nextAccountAction({ ...summary, usage: { ...summary.usage, remainingSpotChecks: 0 } }, [{ ...check, status: "NEEDS_CONFIRMATION" }], true)).toEqual({ kind: "processing", id: check.id });
  });
  it("takes pending units and retained slots to their existing detail rather than a new-property flow", () => {
    expect(nextAccountAction({ ...summary, pricingUnits: [unit] }, [], true)).toEqual({ kind: "unit", id: unit.id });
    expect(nextAccountAction({ ...summary, pricingUnits: [{ ...unit, active: false }] }, [], true)).toEqual({ kind: "reactivate", id: unit.id });
    expect(nextAccountAction(summary, [], true).kind).toBe("add");
  });
  it("shows the quota recovery path when allowance is exhausted", () => {
    expect(nextAccountAction({ ...summary, usage: { ...summary.usage, remainingSpotChecks: 0 }, pricingUnits: [unit] }, [], true).kind).toBe("quota");
  });
});

describe("New Zealand date labels", () => {
  it("explains cancellation using the persisted service-end date and refuses an unknown end", () => {
    expect(renewalCancellationMessage({ ...summary, currentPeriodEnd: "2026-11-01T00:00:00Z" }, "en")).toContain("Service ends: 1 Nov 2026");
    expect(renewalCancellationMessage({ ...summary, currentPeriodEnd: "2026-11-01T00:00:00Z" }, "zh")).toContain("服务截止");
    expect(renewalCancellationMessage({ ...summary, currentPeriodEnd: null }, "en")).toBeNull();
  });
  it("keeps calendar keys on the same day during NZ summer time", () => {
    expect(accountDate("2026-10-14", "en")).toBe("14 Oct 2026");
    expect(accountDate("2026-10-14", "zh")).toContain("14");
  });
  it("uses the NZ day across a UTC date boundary and handles absent records", () => {
    expect(accountDate("2026-10-12T12:00:00Z", "en", true)).toContain("13 Oct 2026");
    expect(accountDate(null, "zh")).toBe("暂无记录");
    expect(membershipStatus("ACTIVE", "zh")).toBe("有效");
    expect(membershipStatus("NEW_STATE", "zh")).toBe("状态待确认");
  });
});
