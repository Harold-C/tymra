"use client";

import { AlertTriangle, Clock3, CreditCard, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Locale, MembershipPlan, MembershipSummary, ApiPayload } from "./contracts";
import { accountCopy } from "./AccountState";
import { CapacityPlans } from "./CapacityPlans";
import { accountDate, membershipStatus, nextAccountAction, overviewCopy, renewalCancellationMessage, usageWindowLabel, pricingUnitDeactivationMessage } from "../../lib/account-overview";
import { MemberActionConfirmation } from "./MemberActionConfirmation";

type ChangeQuote = { plan: MembershipPlan; capacity: number; quoteToken: string; amountDueMinor: number; recurringMinor: number; mode: "IMMEDIATE" | "NEXT_PERIOD"; effectiveAt: string; expiresAt: string };

export function MembershipPanel({ locale, membership, overview = false, checks = [], emailVerified = true, children }: { locale: Locale; membership: MembershipSummary; overview?: boolean; checks?: import("./contracts").CheckListItem[]; emailVerified?: boolean; children?: ReactNode }) {
  const copy = accountCopy[locale];
  const t = overviewCopy[locale];
  const allowanceLabel = usageWindowLabel(membership, locale);
  const next = nextAccountAction(membership, checks, emailVerified);
  const action = t.actions[next.kind];
  const actionHref = action[2].startsWith("#") ? action[2] : `/${locale}${action[2]}${next.id ?? ""}`;
  const adminGranted = membership.entitlementSource === "ADMIN";
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [quote, setQuote] = useState<ChangeQuote | null>(null);
  const [retainedIds, setRetainedIds] = useState<string[]>([]);
  const [confirmation, setConfirmation] = useState<"cancel" | MembershipSummary["pricingUnits"][number] | null>(null);
  const closeConfirmation = useCallback(() => setConfirmation(null), []);
  const reviewRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (quote) reviewRef.current?.focus(); }, [quote]);
  const activeUnits = membership.pricingUnits.filter((unit) => unit.occupiesSlot).length;
  const money = (minor: number) => new Intl.NumberFormat(locale === "zh" ? "zh-NZ" : "en-NZ", { style: "currency", currency: "NZD" }).format(minor / 100);
  const date = (value: string | null | undefined, time = false) => accountDate(value, locale, time);

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
    <section className={`membership-panel ${overview ? "membership-overview" : ""}`} aria-labelledby="membership-heading" lang={locale === "zh" ? "zh-CN" : "en-NZ"}>
      <div className="membership-summary">
        <div className="membership-current"><div><span>{copy.membershipEyebrow}</span><h2 id="membership-heading">{copy.planNames[membership.plan]}</h2></div><p className="member-status">{membershipStatus(membership.status, locale)} <code>{membership.status}</code></p></div>
        {membership.currentPeriodStart && membership.currentPeriodEnd ? <p className="member-period">{t.currentPeriod}: {date(membership.currentPeriodStart)} – {date(membership.currentPeriodEnd)}</p> : null}
        {membership.currentPeriodEnd ? <p className="member-period">{adminGranted ? (locale === "zh" ? "当前额度周期截止" : "Allowance period ends") : membership.cancelAtPeriodEnd ? t.serviceEnd : t.renewal}: {date(membership.currentPeriodEnd, true)}</p> : null}
        <dl>
          <div><dt>{copy.spotChecks}</dt><dd>{membership.usage.remainingSpotChecks} <small>{t.remaining}</small></dd><small>{membership.usage.rollingSpotChecks}/{membership.entitlements.rollingSpotCheckLimit} {t.used} · {allowanceLabel}</small>{membership.plan === "FREE" && !membership.usage.initialReportConsumed ? <small>{t.initial}</small> : null}</div>
          <div><dt>{copy.activeUnits}</dt><dd>{activeUnits}/{membership.entitlements.activePricingUnitLimit}</dd><small>{membership.pricingUnits.filter((unit) => unit.active).length} {t.active}</small></div>
          <div><dt>{t.daily}</dt><dd>{membership.entitlements.dailyPriceCheckHorizonDays} {copy.days}</dd>{membership.coverage ? <small>{date(membership.coverage.dailyStart)} – {date(membership.coverage.dailyEnd)}</small> : null}</div>
          <div><dt>{t.monitoring}</dt><dd>{membership.entitlements.monitoringHorizonDays - membership.entitlements.dailyPriceCheckHorizonDays} {copy.days}</dd>{membership.coverage?.monitoringStart ? <small>{date(membership.coverage.monitoringStart)} – {date(membership.coverage.monitoringEnd)}</small> : null}<small>{t.monitoringBody}</small></div>
        </dl>
        <div className="membership-timing"><p>{membership.usage.nextSpotCheckAt ? `${t.availableAt}: ${date(membership.usage.nextSpotCheckAt, true)}` : t.available}</p>{membership.usage.windowStart && membership.usage.windowEnd ? <p>{allowanceLabel}: {date(membership.usage.windowStart, true)} – {date(membership.usage.windowEnd, true)}</p> : null}<p>{t.timeZone}</p></div>
        {membership.status === "PAST_DUE" ? <div className="membership-warning"><AlertTriangle aria-hidden="true" />{copy.paymentPastDue}</div> : null}
        {membership.graceEndsAt ? <p className="member-period">{t.graceEnd}: {date(membership.graceEndsAt, true)}</p> : null}
        {membership.cancelAtPeriodEnd ? <div className="membership-warning"><Clock3 aria-hidden="true" />{copy.cancelsAtPeriodEnd}</div> : null}
        {membership.pendingPlan ? <div className="membership-notice"><Clock3 aria-hidden="true" />{copy.pendingPlan.replace("{plan}", copy.planNames[membership.pendingPlan])}</div> : null}
        {adminGranted ? <div className="membership-notice"><p><strong>{locale === "zh" ? "管理员授予权益" : "Administrator-granted membership"}</strong> · {membership.adminGrant?.expiresAt ? `${locale === "zh" ? "有效至" : "Valid through"} ${date(new Date(new Date(membership.adminGrant.expiresAt).getTime() - 1).toISOString())}` : locale === "zh" ? "长期有效" : "No expiry"}</p><p>{locale === "zh" ? "无月费。额外检查额度按新西兰自然月计算；已使用次数保留。" : "No monthly charge. Extra-check allowance follows the New Zealand calendar month; existing usage is retained."}</p></div> : <p>{locale === "zh" ? "当前月费（含GST）" : "Current monthly price (GST included)"}: {money(membership.entitlements.monthlyPriceMinor ?? 0)}{membership.currentPeriodEnd ? ` · ${locale === "zh" ? "账期结束" : "Period ends"} ${date(membership.currentPeriodEnd)}` : ""}</p>}
        {membership.pendingCapacity ? <p>{locale === "zh" ? `待生效容量：${membership.pendingCapacity}` : `Pending capacity: ${membership.pendingCapacity}`}</p> : null}
        {membership.historyGraceUntil ? <p>{locale === "zh" ? "旧方案历史数据可查看及导出至" : "Previous-plan history available to read and export until"} {date(membership.historyGraceUntil)} · <a href={`/${locale}/account/exports`}>{locale === "zh" ? "导出保留的历史" : "Export retained history"}</a></p> : null}
      </div>
      <section className="overview-section overview-units" aria-labelledby="account-units-heading"><div className="overview-section-title"><h2 id="account-units-heading">{t.units}</h2><Link href={`/${locale}/account/pricing-units`}>{locale === "zh" ? "管理房源" : "Manage properties"}</Link></div>
        {membership.pricingUnits.length ? <div className="membership-unit-list">{membership.pricingUnits.map((unit) => <article key={unit.id} className="overview-unit"><div><h3><Link href={`/${locale}/account/pricing-units/${unit.id}`}>{unit.propertyName}</Link></h3><p>{unit.verificationStatus === "PENDING_OTA_VERIFICATION" ? t.pendingUnit : unit.unitName}{unit.city ? ` · ${unit.city}` : ""}</p><span className="member-unit-status">{unit.active ? t.active : t.inactive}</span>{unit.listings?.length ? <p>{unit.listings.map((listing) => listing.platform).join(" · ")}</p> : null}</div><div className="overview-unit-evidence"><small>{t.lastObserved}: {date(unit.lastObservedAt, true)}</small><small>{t.lastCompleted}: {unit.lastCompletedAt ? date(unit.lastCompletedAt, true) : t.never}</small><small>{t.schedule}: {membership.entitlements.scheduledAnalysesPerWeek === 0 ? t.onDemand : `${membership.entitlements.scheduledAnalysesPerWeek}×/${locale === "zh" ? "周" : "week"}${unit.schedule?.enabled ? "" : ` · ${t.scheduleOff}`}`}</small>{unit.schedule?.nextEligibleAt && unit.active && membership.serviceable ? <small>{t.nextEligible}: {date(unit.schedule.nextEligibleAt, true)}</small> : null}{unit.slotRetainedUntil && !unit.active ? <small>{t.retained}: {date(unit.slotRetainedUntil, true)}</small> : null}</div><div className="overview-unit-actions"><Link href={`/${locale}/account/pricing-units/${unit.id}`}>{t.detail}</Link><Link href={`/${locale}/account/calendar?pricingUnitId=${unit.id}`}>{t.calendar}</Link><button type="button" disabled={pendingAction !== null} onClick={() => unit.active ? setConfirmation(unit) : void togglePricingUnit(unit)}>{locale === "zh" ? unit.active ? "停用" : "启用" : unit.active ? "Deactivate" : "Activate"}</button></div></article>)}</div> : <div className="overview-empty"><h3>{t.noUnits}</h3><p>{t.noUnitsBody}</p></div>}
      </section>
      {overview ? <section className="overview-next" aria-labelledby="account-next-heading"><div><h2 id="account-next-heading">{t.next}</h2><p>{action[0]}</p></div><Link className="button button-primary" href={actionHref}>{action[1]}</Link></section> : null}
      {children}
      <section className="overview-section" aria-labelledby="account-billing-heading"><div className="overview-section-title"><h2 id="account-billing-heading">{t.planActions}</h2>{overview ? <Link href={`/${locale}/account/billing`}>{t.managePlan}</Link> : null}</div>
        {membership.pendingChangeKind === "CHECKOUT" && membership.pendingPlan && !membership.hasLinkedSubscription ? <button type="button" className="button button-secondary" disabled={pendingAction !== null} onClick={() => void startAction("checkout", membership.pendingPlan!, membership.pendingCapacity ?? undefined)}>{locale === "zh" ? "继续未完成的付款" : "Resume checkout"}</button> : null}
        {!adminGranted && (membership.hasBillingAccount || membership.plan !== "FREE") ? <div className="membership-billing-actions"><button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("portal")}><CreditCard aria-hidden="true" />{copy.manageBilling}</button>{membership.plan !== "FREE" && (membership.cancelAtPeriodEnd ? <button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => void startAction("resume")}>{copy.resumeMembership}</button> : <button className="button button-secondary" type="button" disabled={pendingAction !== null || !membership.currentPeriodEnd || membership.status === "CANCELLED"} onClick={() => setConfirmation("cancel")}>{copy.cancelMembership}</button>)}</div> : null}
      {adminGranted ? null : quote ? <div ref={reviewRef} tabIndex={-1} className="membership-quote" role="region" aria-label={locale === "zh" ? "确认方案变更" : "Review subscription change"}>
        <h3>{copy.planNames[quote.plan]} · {quote.capacity} {locale === "zh" ? "个监测额度" : "monitored slots"}</h3>
        <p>{locale === "zh" ? "本次应付" : "Due today"}: <strong>{money(quote.amountDueMinor)}</strong></p>
        <p>{locale === "zh" ? "下期月费（含GST）" : "Next monthly price (GST included)"}: <strong>{money(quote.recurringMinor)}</strong></p>
        <p>{quote.mode === "NEXT_PERIOD" ? locale === "zh" ? `于 ${date(quote.effectiveAt)} 生效，本期服务不变。选择下期保留的监测对象：` : `Effective ${date(quote.effectiveAt)}. Current service continues. Select monitored objects to retain:` : locale === "zh" ? "付款确认后生效。本期仅按剩余时间增加额度，已用次数不清零。" : "Effective after payment confirmation. Only the prorated allowance increase is added; existing usage is retained."}</p>
        {quote.mode === "NEXT_PERIOD" ? <fieldset><legend>{locale === "zh" ? `已选择 ${retainedIds.length}/${quote.capacity}` : `Selected ${retainedIds.length}/${quote.capacity}`}</legend>{membership.pricingUnits.filter(unit => unit.active).map(unit => <label key={unit.id}><input type="checkbox" checked={retainedIds.includes(unit.id)} onChange={event => setRetainedIds(ids => event.target.checked ? [...ids, unit.id] : ids.filter(id => id !== unit.id))} />{unit.propertyName} · {unit.unitName}</label>)}</fieldset> : null}
        <div className="membership-billing-actions"><button className="button button-secondary" type="button" disabled={pendingAction !== null} onClick={() => setQuote(null)}>{locale === "zh" ? "返回" : "Back"}</button><button className="button button-primary" type="button" disabled={pendingAction !== null || retainedIds.length > quote.capacity} onClick={() => void startAction("change-plan", quote.plan, quote.capacity)}>{pendingAction ? <LoaderCircle className="spin" aria-hidden="true" /> : null}{locale === "zh" ? "确认变更" : "Confirm change"}</button></div>
      </div> : <CapacityPlans locale={locale} initialCapacity={membership.entitlements.activePricingUnitLimit} availability={membership.launchAvailability} capacityLaunchLimit={membership.capacityLaunchLimit} busy={pendingAction !== null} onChoose={(plan, capacity) => void startAction(membership.plan === "FREE" ? "checkout" : "preview", plan, capacity)} />}
      </section>
      {actionError ? <div className="flow-notice notice-danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>{copy.billingError}</strong><p>{actionError}</p></div></div> : null}
      {confirmation ? <MemberActionConfirmation title={confirmation === "cancel" ? t.cancelTitle : t.deactivateTitle} body={confirmation === "cancel" ? renewalCancellationMessage(membership, locale) ?? t.endUnknown : pricingUnitDeactivationMessage(membership, confirmation, locale)} cancelLabel={t.keep} confirmLabel={confirmation === "cancel" ? t.confirmCancel : t.confirmDeactivate} onCancel={closeConfirmation} onConfirm={() => { const confirmed = confirmation; setConfirmation(null); if (confirmed === "cancel" && membership.currentPeriodEnd && !adminGranted) void startAction("cancel"); else if (confirmed !== "cancel") void togglePricingUnit(confirmed); }} />
        : null}
    </section>
  );
}
