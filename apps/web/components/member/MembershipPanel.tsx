"use client";

import { AlertTriangle, Clock3, CreditCard, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Locale, MembershipPlan, MembershipSummary, ApiPayload } from "./contracts";
import { accountCopy } from "./AccountState";

export function MembershipPanel({ locale, membership }: { locale: Locale; membership: MembershipSummary }) {
  const copy = accountCopy[locale];
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const activeUnits = membership.pricingUnits.filter((unit) => unit.occupiesSlot).length;

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
    <section className="membership-panel" aria-labelledby="membership-heading">
      <div className="membership-summary">
        <div><span>{copy.membershipEyebrow}</span><h2 id="membership-heading">{copy.planNames[membership.plan]}</h2><p>{copy.membershipStatus}: {membership.status}</p></div>
        <dl>
          <div><dt>{copy.spotChecks}</dt><dd>{membership.usage.remainingSpotChecks}</dd></div>
          <div><dt>{copy.activeUnits}</dt><dd>{activeUnits}/{membership.entitlements.activePricingUnitLimit}</dd></div>
          <div><dt>{copy.dailyWindow}</dt><dd>{membership.entitlements.dailyPriceCheckHorizonDays} {copy.days}</dd></div>
          <div><dt>{copy.monitoringWindow}</dt><dd>{membership.entitlements.monitoringHorizonDays} {copy.days}</dd></div>
          <div><dt>{locale === "zh" ? "分析频率" : "Analysis cadence"}</dt><dd>{membership.entitlements.scheduledAnalysesPerWeek === 0 ? locale === "zh" ? "按需" : "On demand" : membership.entitlements.scheduledAnalysesPerWeek >= 7 ? locale === "zh" ? "每日" : "Daily" : `${membership.entitlements.scheduledAnalysesPerWeek}×/${locale === "zh" ? "周" : "week"}`}</dd></div>
          <div><dt>{locale === "zh" ? "下次检查额度" : "Next check allowance"}</dt><dd>{membership.usage.nextSpotCheckAt ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(membership.usage.nextSpotCheckAt)) : locale === "zh" ? "现在可用" : "Available now"}</dd></div>
        </dl>
        {membership.status === "PAST_DUE" ? <div className="membership-warning"><AlertTriangle aria-hidden="true" />{copy.paymentPastDue}</div> : null}
        {membership.cancelAtPeriodEnd ? <div className="membership-warning"><Clock3 aria-hidden="true" />{copy.cancelsAtPeriodEnd}</div> : null}
        {membership.pendingPlan ? <div className="membership-notice"><Clock3 aria-hidden="true" />{copy.pendingPlan.replace("{plan}", copy.planNames[membership.pendingPlan])}</div> : null}
        {membership.pricingUnits.length ? <div className="membership-unit-list">{membership.pricingUnits.map((unit) => <div key={unit.id}><span><strong>{unit.propertyName}</strong><small>{unit.unitName}</small></span><button type="button" disabled={pendingAction !== null} onClick={() => void togglePricingUnit(unit)}>{locale === "zh" ? unit.active ? "停用" : "启用" : unit.active ? "Deactivate" : "Activate"}</button></div>)}</div> : null}
        {membership.plan !== "FREE" ? <div className="membership-billing-actions">
          <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("portal")}><CreditCard aria-hidden="true" />{copy.manageBilling}</button>
          {membership.cancelAtPeriodEnd
            ? <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("resume")}>{copy.resumeMembership}</button>
            : <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("cancel")}>{copy.cancelMembership}</button>}
        </div> : null}
      </div>
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
      {actionError ? <div className="flow-notice notice-danger"><AlertTriangle aria-hidden="true" /><div><strong>{copy.billingError}</strong><p>{actionError}</p></div></div> : null}
    </section>
  );
}
