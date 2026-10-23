"use client";

import { AlertTriangle, Clock3, CreditCard, LoaderCircle } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Locale, MembershipPlan, MembershipSummary, ApiPayload, CheckListItem } from "./contracts";
import { accountCopy } from "./AccountState";
import { accountDate, membershipStatus, nextAccountAction, overviewCopy, renewalCancellationMessage } from "../../lib/account-overview";
import { MemberActionConfirmation } from "./MemberActionConfirmation";

export function MembershipPanel({ locale, membership, overview = false, checks = [], emailVerified = true, children }: { locale: Locale; membership: MembershipSummary; overview?: boolean; checks?: CheckListItem[]; emailVerified?: boolean; children?: ReactNode }) {
  const copy = accountCopy[locale];
  const t = overviewCopy[locale];
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<"cancel" | MembershipSummary["pricingUnits"][number] | null>(null);
  const closeConfirmation = useCallback(() => setConfirmation(null), []);
  const activeUnits = membership.pricingUnits.filter((unit) => unit.occupiesSlot).length;
  const next = nextAccountAction(membership, checks, emailVerified);
  const action = t.actions[next.kind];
  const actionHref = action[2].startsWith("#") ? action[2] : `/${locale}${action[2]}${next.id ?? ""}`;
  const date = (value: string | null | undefined, time = false) => accountDate(value, locale, time);

  const startAction = async (path: "checkout" | "change-plan" | "portal" | "cancel" | "resume", plan?: MembershipPlan) => {
    setPendingAction(`${path}:${plan ?? "current"}`);
    setActionError(null);
    try {
      const response = await fetch(`/api/v1/customer/membership/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: plan ? JSON.stringify({ plan }) : undefined,
      });
      const payload = await response.json() as ApiPayload<{ url?: string }>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.billingError);
      if (payload.data.url) window.location.assign(payload.data.url);
      else window.location.reload();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : copy.billingError);
      setPendingAction(null);
    }
  };

  const togglePricingUnit = async (unit: MembershipSummary["pricingUnits"][number]) => {
    setPendingAction(`unit:${unit.id}`);
    setActionError(null);
    try {
      const response = await fetch(`/api/v1/customer/membership/pricing-units/${unit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ active: !unit.active }),
      });
      const payload = await response.json() as ApiPayload<{ id: string; active: boolean }>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.billingError);
      window.location.reload();
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : copy.billingError);
      setPendingAction(null);
    }
  };

  return (
    <section className={`membership-panel ${overview ? "membership-overview" : ""}`} aria-labelledby="membership-heading" lang={locale === "zh" ? "zh-CN" : "en-NZ"}>
      <div className="membership-summary">
        <div className="membership-current"><div><span>{copy.membershipEyebrow}</span><h2 id="membership-heading">{copy.planNames[membership.plan]}</h2></div><p className="member-status">{membershipStatus(membership.status, locale)} <code>{membership.status}</code></p></div>
        {membership.currentPeriodStart && membership.currentPeriodEnd ? <p className="member-period">{t.currentPeriod}: {date(membership.currentPeriodStart)} – {date(membership.currentPeriodEnd)}</p> : null}
        {membership.currentPeriodEnd ? <p className="member-period">{membership.cancelAtPeriodEnd ? t.serviceEnd : t.renewal}: {date(membership.currentPeriodEnd, true)}</p> : null}
        <dl>
          <div><dt>{copy.spotChecks}</dt><dd>{membership.usage.remainingSpotChecks} <small>{t.remaining}</small></dd><small>{membership.usage.rollingSpotChecks}/{membership.entitlements.rollingSpotCheckLimit} {t.used} · {t.rolling}</small>{membership.plan === "FREE" && !membership.usage.initialReportConsumed ? <small>{t.initial}</small> : null}</div>
          <div><dt>{copy.activeUnits}</dt><dd>{activeUnits}/{membership.entitlements.activePricingUnitLimit}</dd><small>{membership.pricingUnits.filter((unit) => unit.active).length} {t.active}</small></div>
          <div><dt>{t.daily}</dt><dd>{membership.entitlements.dailyPriceCheckHorizonDays} {copy.days}</dd>{membership.coverage ? <small>{date(membership.coverage.dailyStart)} – {date(membership.coverage.dailyEnd)}</small> : null}</div>
          <div><dt>{t.monitoring}</dt><dd>{membership.entitlements.monitoringHorizonDays - membership.entitlements.dailyPriceCheckHorizonDays} {copy.days}</dd>{membership.coverage?.monitoringStart ? <small>{date(membership.coverage.monitoringStart)} – {date(membership.coverage.monitoringEnd)}</small> : null}<small>{t.monitoringBody}</small></div>
        </dl>
        <div className="membership-timing"><p>{membership.usage.nextSpotCheckAt ? `${t.availableAt}: ${date(membership.usage.nextSpotCheckAt, true)}` : t.available}</p>{membership.usage.windowStart && membership.usage.windowEnd ? <p>{t.rolling}: {date(membership.usage.windowStart, true)} – {date(membership.usage.windowEnd, true)}</p> : null}<p>{t.timeZone}</p></div>
        {membership.status === "PAST_DUE" ? <div className="membership-warning"><AlertTriangle aria-hidden="true" />{copy.paymentPastDue}</div> : null}
        {membership.graceEndsAt ? <p className="member-period">{t.graceEnd}: {date(membership.graceEndsAt, true)}</p> : null}
        {membership.cancelAtPeriodEnd ? <div className="membership-warning"><Clock3 aria-hidden="true" />{copy.cancelsAtPeriodEnd}</div> : null}
        {membership.pendingPlan ? <div className="membership-notice"><Clock3 aria-hidden="true" />{copy.pendingPlan.replace("{plan}", copy.planNames[membership.pendingPlan])}</div> : null}
      </div>
      <section className="overview-section overview-units" aria-labelledby="account-units-heading"><div className="overview-section-title"><h2 id="account-units-heading">{t.units}</h2><Link href={`/${locale}/account/pricing-units`}>{locale === "zh" ? "管理房源" : "Manage properties"}</Link></div>
        {membership.pricingUnits.length ? <div className="membership-unit-list">{membership.pricingUnits.map((unit) => <article key={unit.id} className="overview-unit"><div><h3><Link href={`/${locale}/account/pricing-units/${unit.id}`}>{unit.propertyName}</Link></h3><p>{unit.verificationStatus === "PENDING_OTA_VERIFICATION" ? t.pendingUnit : unit.unitName}{unit.city ? ` · ${unit.city}` : ""}</p><span className="member-unit-status">{unit.active ? t.active : t.inactive}</span>{unit.listings?.length ? <p>{unit.listings.map((listing) => listing.platform).join(" · ")}</p> : null}</div><div className="overview-unit-evidence"><small>{t.lastObserved}: {date(unit.lastObservedAt, true)}</small><small>{t.lastCompleted}: {unit.lastCompletedAt ? date(unit.lastCompletedAt, true) : t.never}</small><small>{t.schedule}: {membership.entitlements.scheduledAnalysesPerWeek === 0 ? t.onDemand : `${membership.entitlements.scheduledAnalysesPerWeek}×/${locale === "zh" ? "周" : "week"}${unit.schedule?.enabled ? "" : ` · ${t.scheduleOff}`}`}</small>{unit.schedule?.nextEligibleAt && unit.active && membership.serviceable ? <small>{t.nextEligible}: {date(unit.schedule.nextEligibleAt, true)}</small> : null}{unit.slotRetainedUntil && !unit.active ? <small>{t.retained}: {date(unit.slotRetainedUntil, true)}</small> : null}</div><div className="overview-unit-actions"><Link href={`/${locale}/account/pricing-units/${unit.id}`}>{t.detail}</Link><Link href={`/${locale}/account/calendar?pricingUnitId=${unit.id}`}>{t.calendar}</Link><button type="button" disabled={pendingAction !== null} onClick={() => unit.active ? setConfirmation(unit) : void togglePricingUnit(unit)}>{locale === "zh" ? unit.active ? "停用" : "启用" : unit.active ? "Deactivate" : "Activate"}</button></div></article>)}</div> : <div className="overview-empty"><h3>{t.noUnits}</h3><p>{t.noUnitsBody}</p></div>}
      </section>
      {overview ? <section className="overview-next" aria-labelledby="account-next-heading"><div><h2 id="account-next-heading">{t.next}</h2><p>{action[0]}</p></div><Link className="button button-primary" href={actionHref}>{action[1]}</Link></section> : null}
      {children}
      <section className="overview-section" aria-labelledby="account-billing-heading"><div className="overview-section-title"><h2 id="account-billing-heading">{t.planActions}</h2>{overview ? <Link href={`/${locale}/account/billing`}>{t.managePlan}</Link> : null}</div>
        {membership.plan !== "FREE" ? <div className="membership-billing-actions"><button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("portal")}><CreditCard aria-hidden="true" />{copy.manageBilling}</button>{membership.cancelAtPeriodEnd ? <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("resume")}>{copy.resumeMembership}</button> : <button className="button button-secondary" type="button" disabled={pendingAction !== null || !membership.currentPeriodEnd} onClick={() => setConfirmation("cancel")}>{copy.cancelMembership}</button>}{!membership.currentPeriodEnd ? <p>{t.endUnknown}</p> : null}</div> : null}
      <div className="membership-plan-grid">
        {(["FREE", "HOST", "PRO", "PORTFOLIO"] as const).map((plan) => {
          const current = plan === membership.plan;
          const available = membership.launchAvailability[plan];
          const paid = membership.plan !== "FREE";
          return <article className={current ? "is-current" : ""} key={plan}>
            <span>{current ? copy.currentPlan : available ? copy.available : copy.launchGate}</span>
            <h3>{copy.planNames[plan]}</h3>
            <strong>{copy.planPrices[plan]}</strong>
            <p>{copy.planDescriptions[plan]}</p>
            {!current && plan !== "FREE" ? <button className="button button-primary" type="button" disabled={!available || pendingAction !== null} onClick={() => void startAction(paid ? "change-plan" : "checkout", plan)}>{pendingAction?.endsWith(plan) ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{available ? copy.choosePlan : copy.notAvailable}</button> : null}
          </article>;
        })}
      </div>
      </section>
      {actionError ? <div className="flow-notice notice-danger"><AlertTriangle aria-hidden="true" /><div><strong>{copy.billingError}</strong><p>{actionError}</p></div></div> : null}
      {confirmation ? <MemberActionConfirmation title={confirmation === "cancel" ? t.cancelTitle : t.deactivateTitle} body={confirmation === "cancel" ? renewalCancellationMessage(membership, locale) ?? t.endUnknown : `${confirmation.propertyName}. ${t.deactivateBody}`} cancelLabel={t.keep} confirmLabel={confirmation === "cancel" ? t.confirmCancel : t.confirmDeactivate} onCancel={closeConfirmation} onConfirm={() => { const confirmed = confirmation; setConfirmation(null); if (confirmed === "cancel" && membership.currentPeriodEnd) void startAction("cancel"); else if (confirmed !== "cancel") void togglePricingUnit(confirmed); }} /> : null}
    </section>
  );
}
