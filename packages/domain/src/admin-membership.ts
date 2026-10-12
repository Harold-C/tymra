import { addNzCalendarDays, nzDateKey, nzStartOfDay } from "./nz-time";
import { entitlementsForMembership, membershipEntitlements, type MembershipPlanId } from "./membership";

export const ADMIN_MEMBERSHIP_BILLING_VERSION = "admin-grant-2026";
export type AdminMembershipGrantState = {
  plan: MembershipPlanId;
  capacity: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  version: number;
  historyGraceUntil: Date | null;
  historyGraceCutoff: Date | null;
};
type MembershipState = {
  plan: MembershipPlanId;
  status: "ACTIVE" | "PAST_DUE" | "CANCELLED" | "INCOMPLETE" | "PAUSED";
  version: number;
  billingVersion: string;
  purchasedCapacity: number | null;
  periodSpotCheckLimit: number | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
  cancelAtPeriodEnd: boolean;
  pendingPlan: MembershipPlanId | null;
  pendingCapacity: number | null;
  pendingChangeKind: string | null;
  historyGraceUntil: Date | null;
  historyGraceCutoff: Date | null;
  adminGrant?: AdminMembershipGrantState | null;
};

export function adminGrantIsActive(grant: AdminMembershipGrantState | null | undefined, now = new Date()) {
  return Boolean(grant && !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > now));
}

export function adminMembershipMonth(now = new Date()) {
  const key = nzDateKey(now);
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const nextKey = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  return { start: nzStartOfDay(`${key.slice(0, 7)}-01`), end: nzStartOfDay(nextKey) };
}

export function adminGrantExpiry(expiresOn: string | null, now = new Date()) {
  if (expiresOn === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || new Date(`${expiresOn}T00:00:00Z`).toISOString().slice(0, 10) !== expiresOn) throw new RangeError("Choose a valid expiry date.");
  const expiresAt = nzStartOfDay(addNzCalendarDays(expiresOn, 1));
  if (expiresAt <= now) throw new RangeError("The expiry date must not be in the past.");
  return expiresAt;
}

export function adminGrantHistoryGrace(grant: Pick<AdminMembershipGrantState, "plan" | "capacity">, endedAt: Date) {
  const days = entitlementsForMembership({ plan: grant.plan, purchasedCapacity: grant.capacity }).historyRetentionDays;
  return { historyGraceUntil: new Date(endedAt.getTime() + 30 * 86400000), historyGraceCutoff: new Date(endedAt.getTime() - days * 86400000) };
}

/** Resolve service rights without modifying the underlying financial subscription. */
export function effectiveMembership<T extends MembershipState>(base: T, now = new Date()) {
  const grant = base.adminGrant;
  const version = base.version + (grant?.version ?? 0);
  if (!adminGrantIsActive(grant, now)) {
    const endedAt = grant?.revokedAt ?? (grant?.expiresAt && grant.expiresAt <= now ? grant.expiresAt : null);
    const grace = grant && endedAt ? adminGrantHistoryGrace(grant, endedAt) : null;
    const historyGraceUntil = grant?.historyGraceUntil ?? grace?.historyGraceUntil ?? base.historyGraceUntil;
    const historyGraceCutoff = grant?.historyGraceCutoff ?? grace?.historyGraceCutoff ?? base.historyGraceCutoff;
    return { ...base, version, historyGraceUntil, historyGraceCutoff, entitlementSource: "SUBSCRIPTION" as "ADMIN" | "SUBSCRIPTION" };
  }
  const month = adminMembershipMonth(now);
  return {
    ...base, version, plan: grant!.plan, purchasedCapacity: grant!.capacity,
    status: "ACTIVE" as MembershipState["status"], billingVersion: ADMIN_MEMBERSHIP_BILLING_VERSION,
    currentPeriodStart: month.start, currentPeriodEnd: grant!.expiresAt && grant!.expiresAt < month.end ? grant!.expiresAt : month.end,
    periodSpotCheckLimit: null, graceEndsAt: null, cancelAtPeriodEnd: false,
    pendingPlan: null, pendingCapacity: null, pendingChangeKind: null,
    historyGraceUntil: grant!.historyGraceUntil, historyGraceCutoff: grant!.historyGraceCutoff,
    entitlementSource: "ADMIN" as "ADMIN" | "SUBSCRIPTION",
  };
}

export function membershipHistoryCutoff(input: {
  plan: MembershipPlanId; status: MembershipState["status"]; currentPeriodEnd: Date | null;
  updatedAt?: Date; historyGraceUntil?: Date | null; historyGraceCutoff?: Date | null;
}, now = new Date()) {
  const planCutoff = new Date(now.getTime() - membershipEntitlements[input.plan].historyRetentionDays * 86400000);
  if (input.historyGraceUntil && input.historyGraceUntil > now && input.historyGraceCutoff && input.historyGraceCutoff < planCutoff) return input.historyGraceCutoff;
  if (input.status !== "CANCELLED") return planCutoff;
  const paidPeriodEnd = input.currentPeriodEnd ?? input.updatedAt ?? now;
  return now <= new Date(paidPeriodEnd.getTime() + 30 * 86400000) ? planCutoff : new Date(now.getTime() + 1);
}
