"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, CreditCard, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Locale = "en" | "zh";
type CustomerCheck = {
  id: string;
  analysisType: "LISTING_PRICING" | "LOCATION_BENCHMARK";
  status: string;
  terminal: boolean;
  createdAt: string;
  updatedAt: string;
  isDemo: boolean;
  property: null | { canonicalName: string; city: string };
  unit: null | { officialName: string };
  stayQuery: null | { checkIn: string; checkOut: string; adults: number; children: number; units: number };
  result: null | {
    version: number;
    generatedAt: string;
    dataLastCheckedAt: string | null;
    confidence: string;
    priceResultStatus: string;
    recommendationStatus: string;
    observedSourceCount: number;
    priceEvidenceStatus: string | null;
    recommendationReasonCode: string | null;
    observedPrices: Array<{ source: string; amountMinor: number; currency: string; basis: string; feeCompleteness: string; sourceUrl: string | null; asOf: string | null }>;
    addressCoverage: null | { level: "FULL" | "REGIONAL" | "NATIONAL_ONLY"; marketName: string };
    insights: Array<{
      id: string;
      stayDate: string;
      risk: string;
      targetPriceMinor: number | null;
      competitorMedianMinor: number | null;
      competitorLowMinor: number | null;
      competitorHighMinor: number | null;
      recommendedAction: string;
      confidence: string;
      explanation: unknown;
      limitations: unknown;
    }>;
  };
};

export type CheckListItem = Pick<CustomerCheck, "id" | "analysisType" | "status" | "createdAt" | "isDemo" | "property" | "unit">;
export type MembershipPlan = "FREE" | "HOST" | "PRO" | "PORTFOLIO";
export type MembershipSummary = {
  plan: MembershipPlan;
  status: string;
  serviceable: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  entitlementStartedAt: string;
  graceEndsAt: string | null;
  pendingPlan: MembershipPlan | null;
  entitlements: {
    activePricingUnitLimit: number;
    monitoringHorizonDays: number;
    dailyPriceCheckHorizonDays: number;
    scheduledAnalysesPerWeek: number;
    rollingSpotCheckLimit: number;
    monthlyExportLimit: number;
    dailyApiRequestLimit: number;
  };
  usage: { initialReportConsumed: boolean; rollingSpotChecks: number; remainingSpotChecks: number; nextSpotCheckAt: string | null };
  pricingUnits: Array<{ id: string; active: boolean; occupiesSlot: boolean; sellableUnitId: string; unitName: string; propertyName: string; city: string; activatedAt: string; deactivatedAt: string | null; slotRetainedUntil: string | null }>;
  launchAvailability: Record<MembershipPlan, boolean>;
};
type ApiPayload<T> = { data?: T; error?: { message?: string } };

export function CustomerCheckExperience({ locale, checkId }: { locale: Locale; checkId: string }) {
  const copy = accountCopy[locale];
  const [check, setCheck] = useState<CustomerCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/customer/checks/${checkId}`, { cache: "no-store" });
    const payload = await response.json() as ApiPayload<CustomerCheck>;
    if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.loadError);
    setCheck(payload.data);
    setError(null);
    return payload.data;
  }, [checkId, copy.loadError]);

  useEffect(() => {
    let active = true;
    let timer: number | undefined;
    let consecutiveFailures = 0;
    const poll = async () => {
      try {
        const current = await load();
        consecutiveFailures = 0;
        if (active && !current.terminal) timer = window.setTimeout(poll, 2_000);
      } catch (caught) {
        if (!active) return;
        consecutiveFailures += 1;
        if (consecutiveFailures < 3) {
          timer = window.setTimeout(poll, 1_000);
          return;
        }
        setError(caught instanceof Error ? caught.message : copy.loadError);
      }
    };
    void poll();
    return () => { active = false; if (timer) window.clearTimeout(timer); };
  }, [copy.loadError, load]);

  useEffect(() => {
    if (!check?.terminal) return;
    void fetch(`/api/v1/customer/checks/${checkId}/acknowledge`, { method: "POST" });
  }, [check?.terminal, checkId]);

  if (error) return <AccountState locale={locale} title={copy.accessTitle} body={error} />;
  if (!check) return <AccountState locale={locale} title={copy.loadingTitle} body={copy.loadingBody} loading />;

  const statusCopy = copy.status[check.status as keyof typeof copy.status] ?? check.status;
  if (!check.terminal) {
    return (
      <section className="customer-check-page">
        <section className="customer-status-band">
          <div className="rough-shell customer-status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <span>{copy.formalCheck}</span>
            <h1>{statusCopy}</h1>
            <p>{copy.processingBody}</p>
            <div className="customer-context"><strong>{check.property?.canonicalName}</strong><span>{check.unit?.officialName}</span></div>
          </div>
        </section>
        <RealProgress locale={locale} status={check.status} />
      </section>
    );
  }

  if (check.status !== "PUBLISHED" || !check.result) {
    return <AccountState locale={locale} title={statusCopy} body={copy.terminalBody} />;
  }

  const money = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
  return (
    <section className="customer-check-page">
      <section className="formal-result-header">
        <div className="rough-shell formal-result-heading">
          <span className="rough-eyebrow"><ShieldCheck aria-hidden="true" />{copy.secureReport}</span>
          <h1>{check.property?.canonicalName}</h1>
          <p>{check.unit?.officialName} · {check.property?.city}</p>
          <div className="formal-result-meta"><span>{copy.confidence}: <strong>{check.result.confidence}</strong></span><span>{copy.version}: {check.result.version}</span><span>{copy.generated}: {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(check.result.generatedAt))}</span></div>
        </div>
      </section>
      {check.isDemo ? <div className="rough-shell rough-demo formal-demo"><AlertTriangle aria-hidden="true" /><strong>{copy.demoTitle}</strong><span>{copy.demoBody}</span></div> : null}
      {check.result.priceResultStatus === "COMPLETED" && check.result.recommendationStatus !== "COMPLETED" ? <div className="rough-shell flow-notice notice-warning"><AlertTriangle aria-hidden="true" /><div><strong>{locale === "zh" ? "已获得公开价格" : "Observed price available"}</strong><p>{check.analysisType === "LOCATION_BENCHMARK" ? (locale === "zh" ? "已返回至少一个有效的周边公开价格；可比证据不足，因此暂不提供市场区间或调价建议。" : "At least one valid nearby public price is shown. Comparable evidence is not sufficient for a market range or adjustment recommendation.") : (locale === "zh" ? "已返回有效的目标房源 OTA 价格，但竞品或市场证据不足，因此暂不提供调价建议。" : "A valid target-property OTA price is shown. Comparable or market evidence is not sufficient for an adjustment recommendation.")}</p></div></div> : null}
      {check.result.addressCoverage ? <div className={`rough-shell flow-notice ${check.result.addressCoverage.level === "FULL" ? "notice-success" : "notice-warning"}`}>
        {check.result.addressCoverage.level === "FULL" ? <CheckCircle2 aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}
        <div><strong>{copy.coverage[check.result.addressCoverage.level].title}</strong><p>{copy.coverage[check.result.addressCoverage.level].body.replace("{market}", check.result.addressCoverage.marketName)}</p></div>
      </div> : null}
      {check.result.observedPrices.length ? <section className="rough-shell observed-price-panel" aria-labelledby="observed-price-heading">
        <div className="formal-section-heading"><span>{copy.observedEyebrow}</span><h2 id="observed-price-heading">{check.analysisType === "LOCATION_BENCHMARK" ? (locale === "zh" ? "周边公开价格" : "Observed nearby prices") : copy.observedTitle}</h2><p>{check.analysisType === "LOCATION_BENCHMARK" ? (locale === "zh" ? "展示指定地址附近实际采集到的公开 OTA 价格；不同价格口径不会被静默合并。" : "Public OTA prices actually observed near the address are shown separately; different price bases are not silently combined.") : copy.observedBody}</p></div>
        <div className="observed-price-list">{check.result.observedPrices.map((price, index) => <article key={`${price.source}:${price.basis}:${price.asOf ?? index}`}>
          <div><strong>{price.source}</strong><span>{price.feeCompleteness}</span></div>
          <b>{new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: price.currency, maximumFractionDigits: 2 }).format(price.amountMinor / 100)}</b>
          <dl><div><dt>{copy.priceBasis}</dt><dd>{price.basis}</dd></div><div><dt>{copy.checkedAt}</dt><dd>{price.asOf ? new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(price.asOf)) : "-"}</dd></div></dl>
          {price.sourceUrl ? <a href={price.sourceUrl} rel="noreferrer" target="_blank">{copy.viewSource}</a> : null}
        </article>)}</div>
      </section> : null}
      <section className="formal-insights-band">
        <div className="rough-shell">
          <div className="formal-section-heading"><span>{copy.priorityEyebrow}</span><h2>{copy.priorityTitle}</h2><p>{copy.priorityBody}</p></div>
          {check.result.insights.length ? <div className="formal-insight-list">{check.result.insights.map((insight) => (
            <article key={insight.id} className="formal-insight-row">
              <div><span>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "full", timeZone: "Pacific/Auckland" }).format(new Date(insight.stayDate))}</span><strong>{copy.risk[insight.risk as keyof typeof copy.risk] ?? insight.risk}</strong></div>
              <div><span>{check.analysisType === "LOCATION_BENCHMARK" ? (locale === "zh" ? "周边中位价" : "Nearby median") : copy.target}</span><strong>{check.analysisType === "LOCATION_BENCHMARK" ? insight.competitorMedianMinor == null ? "-" : money.format(insight.competitorMedianMinor / 100) : insight.targetPriceMinor == null ? "-" : money.format(insight.targetPriceMinor / 100)}</strong></div>
              <div><span>{copy.comparable}</span><strong>{insight.competitorLowMinor == null || insight.competitorHighMinor == null ? "-" : `${money.format(insight.competitorLowMinor / 100)}-${money.format(insight.competitorHighMinor / 100)}`}</strong></div>
              <div><span>{copy.action}</span><strong>{check.analysisType === "LOCATION_BENCHMARK" ? (insight.recommendedAction === "USE_LOCAL_BENCHMARK_RANGE" ? (locale === "zh" ? "以该区间作为起始参考" : "Use as a starting range") : (locale === "zh" ? "暂无调价建议" : "No adjustment recommendation")) : copy.actionValue}</strong></div>
            </article>
          ))}</div> : <p>{copy.noInsights}</p>}
          <div className="formal-disclaimer"><AlertTriangle aria-hidden="true" /><p>{copy.disclaimer}</p></div>
          <div className="flow-actions"><Link className="button button-secondary" href={`/${locale}/account`}>{copy.allChecks}</Link><Link className="button button-primary" href={`/${locale}/address-check`}>{copy.another}<ArrowRight aria-hidden="true" /></Link></div>
        </div>
      </section>
    </section>
  );
}

export function CustomerAccount({ locale, blockedReason = null }: { locale: Locale; blockedReason?: string | null }) {
  const copy = accountCopy[locale];
  const [checks, setChecks] = useState<CheckListItem[] | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      fetch("/api/v1/customer/checks", { cache: "no-store" }),
      fetch("/api/v1/customer/membership", { cache: "no-store" }),
    ])
      .then(async ([checksResponse, membershipResponse]) => {
        const [checksPayload, membershipPayload] = await Promise.all([
          checksResponse.json() as Promise<ApiPayload<CheckListItem[]>>,
          membershipResponse.json() as Promise<ApiPayload<MembershipSummary>>,
        ]);
        if (!checksResponse.ok || !checksPayload.data) throw new Error(checksPayload.error?.message ?? copy.loadError);
        if (!membershipResponse.ok || !membershipPayload.data) throw new Error(membershipPayload.error?.message ?? copy.loadError);
        setChecks(checksPayload.data);
        setMembership(membershipPayload.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : copy.loadError));
  }, [copy.loadError]);

  return (
    <section className="account-page">
      <div className="rough-shell">
        <span className="rough-eyebrow">{copy.accountEyebrow}</span><h1>{copy.accountTitle}</h1><p>{copy.accountBody}</p>
        {blockedReason ? <div className="flow-notice notice-warning"><Clock3 aria-hidden="true" /><div><strong>{copy.blocked[blockedReason as keyof typeof copy.blocked]?.title ?? copy.quotaTitle}</strong><p>{copy.blocked[blockedReason as keyof typeof copy.blocked]?.body ?? copy.quotaBody}</p></div></div> : null}
        {error ? <div className="flow-notice notice-danger"><AlertTriangle aria-hidden="true" /><div><strong>{copy.accessTitle}</strong><p>{error}</p></div></div> : null}
        {!checks && !error ? <div className="loading-state"><LoaderCircle className="spin" /><span>{copy.loadingTitle}</span></div> : null}
        {membership ? <MembershipPanel locale={locale} membership={membership} /> : null}
        {checks?.length === 0 ? <div className="account-empty"><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><Link className="button button-primary" href={`/${locale}/address-check`}>{copy.another}</Link></div> : null}
        {checks?.length ? <div className="account-check-list">{checks.map((check) => <Link href={`/${locale}/account/checks/${check.id}`} key={check.id}><span>{check.property?.canonicalName ?? copy.unknownProperty}</span><strong>{check.status}</strong><small>{check.unit?.officialName}</small><ArrowRight aria-hidden="true" /></Link>)}</div> : null}
      </div>
    </section>
  );
}

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

function RealProgress({ locale, status }: { locale: Locale; status: string }) {
  const copy = accountCopy[locale];
  const stages = ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING"];
  const current = Math.max(0, stages.indexOf(status));
  return <section className="customer-progress-band"><div className="rough-shell customer-progress">{copy.progress.map((label, index) => <div className={index <= current ? "is-active" : ""} key={label}><span>{index < current ? <CheckCircle2 aria-hidden="true" /> : index + 1}</span><strong>{label}</strong></div>)}</div></section>;
}

function AccountState({ locale, title, body, loading = false }: { locale: Locale; title: string; body: string; loading?: boolean }) {
  const copy = accountCopy[locale];
  return <section className="rough-loading">{loading ? <LoaderCircle className="spin" aria-hidden="true" /> : <AlertTriangle aria-hidden="true" />}<h1>{title}</h1><p>{body}</p>{!loading ? <Link className="button button-primary" href={`/${locale}`}>{copy.home}</Link> : null}</section>;
}

const accountCopy = {
  en: {
    loadError: "Your secure customer session could not be verified.", accessTitle: "Secure access required", loadingTitle: "Opening your formal Price Check", loadingBody: "Checking the latest persisted status.", formalCheck: "FORMAL PRICE CHECK", processingBody: "You can leave this page. The check keeps running, and one result email is sent only when the result is not delivered here.", terminalBody: "The formal check reached a limited terminal state. No price was invented.", secureReport: "AUTHENTICATED FORMAL REPORT", confidence: "Confidence", version: "Analysis version", generated: "Generated", demoTitle: "Development Demo Data", demoBody: "Not real market data. This local report proves the authenticated workflow only.", observedEyebrow: "PUBLIC OTA EVIDENCE", observedTitle: "Observed target prices", observedBody: "Every valid public target-property price is shown with its source and price basis. Different bases are not silently combined.", priceBasis: "Price basis", checkedAt: "Checked", viewSource: "View public source", coverage: { FULL: { title: "Full market signal coverage", body: "{market}: nationwide, regional and configured local sources are included." }, REGIONAL: { title: "Regional signal coverage", body: "{market}: nationwide and regional evidence is included; local official events and local-flow sources are not yet configured." }, NATIONAL_ONLY: { title: "National signal coverage only", body: "{market}: the region could not be resolved reliably, so no local or regional evidence is implied." } }, priorityEyebrow: "PRIORITY REVIEW", priorityTitle: "Dates that may deserve attention", priorityBody: "The formal report exposes the exact evidence reserved from the rough result.", target: "Target signal", comparable: "Comparable range", action: "Suggested action", actionValue: "Review the current rate", noInsights: "No priority dates were identified.", disclaimer: "Decision support only. Prices and availability can change after collection; Tymra does not guarantee revenue or bookings.", allChecks: "All checks", another: "Run another check", home: "Return home", accountEyebrow: "CUSTOMER ACCOUNT", accountTitle: "Your Price Checks", accountBody: "Reports are protected by your customer session and visible only to you.", quotaTitle: "Price Check allowance reached", quotaBody: "Your rolling membership allowance has been used. Existing reports remain available and the account page shows when your allowance is available again.", blocked: { SPOT_CHECK_QUOTA_REACHED: { title: "Price Check allowance reached", body: "Your rolling allowance has been used. Existing reports remain available." }, PRICING_UNIT_LIMIT_REACHED: { title: "Property-slot limit reached", body: "This plan has no free property slot. A deactivated property remains reserved for 30 days; reactivate it, wait until replacement is available, or choose a plan with more slots." }, MEMBERSHIP_INACTIVE: { title: "Membership collection is paused", body: "Update or reactivate billing to start new collection. Existing reports remain readable during the applicable retention period." }, EMAIL_VERIFICATION_REQUIRED: { title: "Verify your email", body: "Open the verification email before starting a public data collection. You can resend it from Account settings." } }, emptyTitle: "No Price Checks yet", emptyBody: "Start with a supported OTA listing or a New Zealand address.", unknownProperty: "Price Check", membershipEyebrow: "MEMBERSHIP", membershipStatus: "Status", spotChecks: "Checks remaining", activeUnits: "Occupied property slots", dailyWindow: "Daily price window", monitoringWindow: "Monitoring horizon", days: "days", manageBilling: "Manage billing", cancelMembership: "Cancel at period end", resumeMembership: "Resume renewal", paymentPastDue: "Payment is overdue. New collection pauses after the seven-day grace period.", cancelsAtPeriodEnd: "Cancellation is scheduled for the end of the paid period.", pendingPlan: "The change to {plan} is pending payment or the next billing period.", currentPlan: "CURRENT PLAN", available: "AVAILABLE", launchGate: "LAUNCH GATE", choosePlan: "Choose plan", notAvailable: "Not yet available", billingError: "Billing action failed", planNames: { FREE: "Free", HOST: "Host", PRO: "Pro", PORTFOLIO: "Portfolio" }, planPrices: { FREE: "NZ$0", HOST: "NZ$29 / month", PRO: "NZ$89 / month", PORTFOLIO: "NZ$249 / month" }, planDescriptions: { FREE: "One property slot, 14-day daily price window and one rolling check after the first report.", HOST: "One property slot, weekly analysis and a 30-day daily price window.", PRO: "Five property slots, portfolio controls and a 90-day daily price window.", PORTFOLIO: "Twenty property slots, daily analysis and a 180-day daily price window." }, progress: ["Queued", "Collecting source data", "Normalizing", "Analysing", "Quality checking"], status: { QUEUED: "Queued", COLLECTING: "Collecting source data", NORMALIZING: "Normalizing prices", ANALYSING: "Analysing comparable evidence", AUTO_VALIDATING: "Quality checking", EXCEPTION: "Additional checks in progress", PUBLISHED: "Published", PARTIAL: "Partial result", INSUFFICIENT_DATA: "Insufficient data", SOURCE_UNAVAILABLE: "Source unavailable", FAILED: "Check failed" }, risk: { HIGH_PRIORITY: "High priority", REVIEW: "Review", WATCH: "Watch", NO_CLEAR_RISK: "No clear risk" },
  },
  zh: {
    loadError: "无法验证你的安全客户会话。", accessTitle: "需要安全访问", loadingTitle: "正在打开正式价格检查", loadingBody: "正在获取最新的已保存状态。", formalCheck: "正式价格检查", processingBody: "你可以离开此页面。检查会继续运行；只有结果没有在此页面交付时，系统才会发送一封结果邮件。", terminalBody: "正式检查进入了受限终态。系统没有编造价格。", secureReport: "需要登录的正式报告", confidence: "置信度", version: "分析版本", generated: "生成时间", demoTitle: "开发演示数据", demoBody: "不是真实市场数据，仅用于验证需要登录的本地流程。", observedEyebrow: "公开 OTA 证据", observedTitle: "目标房源公开价格", observedBody: "所有有效的目标房源公开价格都会按来源和价格口径分别展示，不会把不同口径静默合并。", priceBasis: "价格口径", checkedAt: "采集时间", viewSource: "查看公开来源", coverage: { FULL: { title: "完整市场信号覆盖", body: "{market}：已包含全国、区域及已配置的本地来源。" }, REGIONAL: { title: "区域信号覆盖", body: "{market}：已包含全国及区域证据；本地官方活动和本地客流来源尚未配置。" }, NATIONAL_ONLY: { title: "仅全国信号覆盖", body: "{market}：无法可靠确定区域，因此不会暗示存在本地或区域证据。" } }, priorityEyebrow: "重点复核", priorityTitle: "可能需要关注的日期", priorityBody: "正式报告会展示粗略结果中保留的准确证据。", target: "目标信号", comparable: "竞品区间", action: "建议动作", actionValue: "复核当前房价", noInsights: "没有识别出重点日期。", disclaimer: "仅供决策支持。采集后价格和可售状态可能变化；Tymra 不保证收入或预订。", allChecks: "全部检查", another: "再次检查", home: "返回首页", accountEyebrow: "客户账户", accountTitle: "你的价格检查", accountBody: "报告由客户会话保护，只有你可以查看。", quotaTitle: "已达到价格检查额度", quotaBody: "当前会员方案的滚动额度已经用完。已有报告仍可查看；账户页面会显示剩余额度。", blocked: { SPOT_CHECK_QUOTA_REACHED: { title: "已达到价格检查额度", body: "当前方案的滚动额度已经用完；已有报告仍可查看。" }, PRICING_UNIT_LIMIT_REACHED: { title: "已达到房源额度上限", body: "当前方案没有空余房源额度。停用后的房源仍会保留额度 30 天；你可以重新启用原房源、等待可替换日期，或升级到更多额度的方案。" }, MEMBERSHIP_INACTIVE: { title: "会员采集已暂停", body: "请更新付款信息或重新开通会员；已有报告仍按适用的保留期提供只读访问。" }, EMAIL_VERIFICATION_REQUIRED: { title: "请验证邮箱", body: "开始公开数据采集前，请先打开验证邮件完成验证；可在账户设置中重新发送。" } }, emptyTitle: "还没有价格检查", emptyBody: "请从一个受支持的 OTA 房源链接或新西兰地址开始。", unknownProperty: "价格检查", membershipEyebrow: "会员方案", membershipStatus: "状态", spotChecks: "剩余主动检查", activeUnits: "已占房源额度", dailyWindow: "逐日价格范围", monitoringWindow: "监测范围", days: "天", manageBilling: "管理付款", cancelMembership: "到期后取消", resumeMembership: "恢复续费", paymentPastDue: "付款逾期；七天宽限期结束后将暂停新的采集。", cancelsAtPeriodEnd: "会员将在当前付费周期结束时取消。", pendingPlan: "变更为 {plan} 的操作正在等待付款确认或下个计费周期。", currentPlan: "当前方案", available: "可开通", launchGate: "尚未验收", choosePlan: "选择方案", notAvailable: "暂未开放", billingError: "付款操作失败", planNames: { FREE: "免费版", HOST: "房东版", PRO: "专业版", PORTFOLIO: "组合版" }, planPrices: { FREE: "NZ$0", HOST: "NZ$29/月", PRO: "NZ$89/月", PORTFOLIO: "NZ$249/月" }, planDescriptions: { FREE: "1 个房源额度、未来 14 天逐日价格，首份报告后每 30 天可主动检查一次。", HOST: "1 个房源额度、每周分析，未来 30 天逐日价格。", PRO: "5 个房源额度、组合管理，未来 90 天逐日价格。", PORTFOLIO: "20 个房源额度、每日分析，未来 180 天逐日价格。" }, progress: ["已排队", "采集来源数据", "价格标准化", "分析竞品证据", "质量检查"], status: { QUEUED: "已排队", COLLECTING: "正在采集来源数据", NORMALIZING: "正在标准化价格", ANALYSING: "正在分析竞品证据", AUTO_VALIDATING: "正在进行质量检查", EXCEPTION: "正在进行额外检查", PUBLISHED: "已发布", PARTIAL: "部分结果", INSUFFICIENT_DATA: "数据不足", SOURCE_UNAVAILABLE: "数据源不可用", FAILED: "检查失败" }, risk: { HIGH_PRIORITY: "高优先级", REVIEW: "建议复核", WATCH: "继续观察", NO_CLEAR_RISK: "没有明确风险" },
  },
} as const;
