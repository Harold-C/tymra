"use client";

import { AlertTriangle, Clock3, CreditCard, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Locale, MembershipPlan, MembershipSummary, ApiPayload } from "./contracts";
import { accountCopy } from "./AccountState";
import { CapacityPlans } from "./CapacityPlans";

type ChangeQuote = { plan: MembershipPlan; capacity: number; quoteToken: string; amountDueMinor: number; recurringMinor: number; mode: "IMMEDIATE" | "NEXT_PERIOD"; effectiveAt: string; expiresAt: string };

export function MembershipPanel({ locale, membership }: { locale: Locale; membership: MembershipSummary }) {
  const copy = accountCopy[locale];
  const adminGranted = membership.entitlementSource === "ADMIN";
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ChangeQuote | null>(null);
  const [retainedIds, setRetainedIds] = useState<string[]>([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const reviewRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (quote) reviewRef.current?.focus(); }, [quote]);
  const activeUnits = membership.pricingUnits.filter((unit) => unit.occupiesSlot).length;
  const money = (minor: number) => new Intl.NumberFormat(locale === "zh" ? "zh-NZ" : "en-NZ", { style: "currency", currency: "NZD" }).format(minor / 100);
  const date = (value: string) => new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeZone: "Pacific/Auckland" }).format(new Date(value));

  const startAction = async (path: "checkout" | "change-plan" | "preview" | "portal" | "cancel" | "resume", plan?: MembershipPlan, capacity?: number) => {
    setPendingAction(`${path}:${plan ?? "current"}`);
    setActionError(null);
    try {
      const response = await fetch(`/api/v1/customer/membership/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: plan ? JSON.stringify({ plan, capacity, ...(path === "change-plan" ? { quoteToken: quote?.quoteToken, retainedUnitIds: retainedIds } : {}) }) : undefined,
      });
      const payload = await response.json() as ApiPayload<ChangeQuote & { url?: string }>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.billingError);
      if (path === "preview") {
        setQuote(payload.data);
        const ids = membership.pricingUnits.filter(unit => unit.active).map(unit => unit.id);
        setRetainedIds(ids.length <= payload.data.capacity ? ids : []);
        setPendingAction(null);
        return;
      }
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
        {adminGranted ? <div className="membership-notice"><p><strong>{locale === "zh" ? "管理员授予权益" : "Administrator-granted membership"}</strong> · {membership.adminGrant?.expiresAt ? `${locale === "zh" ? "有效至" : "Valid through"} ${date(new Date(new Date(membership.adminGrant.expiresAt).getTime() - 1).toISOString())}` : locale === "zh" ? "长期有效" : "No expiry"}</p><p>{locale === "zh" ? "无月费。额外检查额度按新西兰自然月计算；已使用次数保留。" : "No monthly charge. Extra-check allowance follows the New Zealand calendar month; existing usage is retained."}</p></div> : <p>{locale === "zh" ? "当前月费（含GST）" : "Current monthly price (GST included)"}: {money(membership.entitlements.monthlyPriceMinor ?? 0)}{membership.currentPeriodEnd ? ` · ${locale === "zh" ? "账期结束" : "Period ends"} ${date(membership.currentPeriodEnd)}` : ""}</p>}
        {membership.pendingCapacity ? <p>{locale === "zh" ? `待生效容量：${membership.pendingCapacity}` : `Pending capacity: ${membership.pendingCapacity}`}</p> : null}
        {membership.historyGraceUntil ? <p>{locale === "zh" ? "旧方案历史数据可查看及导出至" : "Previous-plan history available to read and export until"} {date(membership.historyGraceUntil)} · <a href={`/${locale}/account/exports`}>{locale === "zh" ? "导出保留的历史" : "Export retained history"}</a></p> : null}
        {membership.pricingUnits.length ? <div className="membership-unit-list">{membership.pricingUnits.map((unit) => <div key={unit.id}><span><strong>{unit.propertyName}</strong><small>{unit.unitName}</small></span><button type="button" disabled={pendingAction !== null} onClick={() => void togglePricingUnit(unit)}>{locale === "zh" ? unit.active ? "停用" : "启用" : unit.active ? "Deactivate" : "Activate"}</button></div>)}</div> : null}
        {membership.pendingChangeKind === "CHECKOUT" && membership.pendingPlan && !membership.hasLinkedSubscription ? <button type="button" className="button button-secondary" disabled={pendingAction !== null} onClick={() => void startAction("checkout", membership.pendingPlan!, membership.pendingCapacity ?? undefined)}>{locale === "zh" ? "继续未完成的付款" : "Resume checkout"}</button> : null}
        {!adminGranted && (membership.hasBillingAccount || membership.plan !== "FREE") ? <div className="membership-billing-actions">
          <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("portal")}><CreditCard aria-hidden="true" />{copy.manageBilling}</button>
          {membership.plan !== "FREE" && (membership.cancelAtPeriodEnd
            ? <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("resume")}>{copy.resumeMembership}</button>
            : <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => setConfirmCancel(true)}>{copy.cancelMembership}</button>)}
        </div> : null}
        {confirmCancel ? <div className="membership-quote" role="region" aria-label={locale === "zh" ? "确认取消续费" : "Confirm cancellation"}>
          <p>{locale === "zh" ? "本期服务保留至到期，之后所有房源停止监测并回到Free。你可以再选择1个免费监测对象；旧历史保留30天供查看和导出。" : "Service continues until period end, then monitoring stops and the account returns to Free. Choose one Free object afterwards; previous history remains readable and exportable for 30 days."}</p>
          <button type="button" className="button button-secondary" disabled={pendingAction !== null} onClick={() => setConfirmCancel(false)}>{locale === "zh" ? "保留续费" : "Keep renewal"}</button>
          <button type="button" className="button button-primary" disabled={pendingAction !== null} onClick={() => void startAction("cancel")}>{locale === "zh" ? "确认到期取消" : "Confirm cancellation"}</button>
        </div> : null}
      </div>
      {adminGranted ? null : quote ? <div ref={reviewRef} tabIndex={-1} className="membership-quote" role="region" aria-label={locale === "zh" ? "确认方案变更" : "Review subscription change"}>
        <h3>{copy.planNames[quote.plan]} · {quote.capacity} {locale === "zh" ? "个监测额度" : "monitored slots"}</h3>
        <p>{locale === "zh" ? "本次应付" : "Due today"}: <strong>{money(quote.amountDueMinor)}</strong></p>
        <p>{locale === "zh" ? "下期月费（含GST）" : "Next monthly price (GST included)"}: <strong>{money(quote.recurringMinor)}</strong></p>
        <p>{quote.mode === "NEXT_PERIOD" ? locale === "zh" ? `于 ${date(quote.effectiveAt)} 生效，本期服务不变。选择下期保留的监测对象：` : `Effective ${date(quote.effectiveAt)}. Current service continues. Select monitored objects to retain:` : locale === "zh" ? "付款确认后生效。本期仅按剩余时间增加额度，已用次数不清零。" : "Effective after payment confirmation. Only the prorated allowance increase is added; existing usage is retained."}</p>
        {quote.mode === "NEXT_PERIOD" ? <fieldset><legend>{locale === "zh" ? `已选择 ${retainedIds.length}/${quote.capacity}` : `Selected ${retainedIds.length}/${quote.capacity}`}</legend>{membership.pricingUnits.filter(unit => unit.active).map(unit => <label key={unit.id}><input type="checkbox" checked={retainedIds.includes(unit.id)} onChange={event => setRetainedIds(ids => event.target.checked ? [...ids, unit.id] : ids.filter(id => id !== unit.id))} />{unit.propertyName} · {unit.unitName}</label>)}</fieldset> : null}
        <div className="membership-billing-actions"><button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => setQuote(null)}>{locale === "zh" ? "返回" : "Back"}</button><button className="button button-primary" type="button" disabled={pendingAction !== null || retainedIds.length > quote.capacity} onClick={() => void startAction("change-plan", quote.plan, quote.capacity)}>{pendingAction ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{locale === "zh" ? "确认变更" : "Confirm change"}</button></div>
      </div> : <CapacityPlans locale={locale} initialCapacity={membership.entitlements.activePricingUnitLimit} availability={membership.launchAvailability} capacityLaunchLimit={membership.capacityLaunchLimit} busy={pendingAction !== null} onChoose={(plan, capacity) => void startAction(membership.plan === "FREE" ? "checkout" : "preview", plan, capacity)} />}
      {actionError ? <div className="flow-notice notice-danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>{copy.billingError}</strong><p>{actionError}</p></div></div> : null}
    </section>
  );
}
