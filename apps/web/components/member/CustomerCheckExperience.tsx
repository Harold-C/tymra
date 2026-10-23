"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Locale, CustomerCheck, ApiPayload } from "./contracts";
import { AccountState, accountCopy } from "./AccountState";

export class CustomerCheckLoadError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export function CustomerCheckExperience({ locale, checkId }: { locale: Locale; checkId: string }) {
  const copy = accountCopy[locale];
  const [check, setCheck] = useState<CustomerCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/customer/checks/${checkId}`, { cache: "no-store" });
    const body = await response.text();
    let payload: ApiPayload<CustomerCheck>;
    try {
      payload = JSON.parse(body) as ApiPayload<CustomerCheck>;
    } catch {
      throw new CustomerCheckLoadError(copy.loadError, response.status === 429 || response.status >= 500);
    }
    if (!response.ok || !payload.data) {
      throw new CustomerCheckLoadError(payload.error?.message ?? copy.loadError, response.status === 429 || response.status >= 500);
    }
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
        const retryable = !(caught instanceof CustomerCheckLoadError) || caught.retryable;
        if (retryable) {
          if (consecutiveFailures >= 3) setError(caught instanceof Error ? caught.message : copy.loadError);
          timer = window.setTimeout(poll, Math.min(5_000, consecutiveFailures * 1_000));
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
  if (check.status === "NEEDS_CONFIRMATION" && check.confirmationStep) {
    return <section className="customer-check-page"><section className="customer-status-band"><div className="rough-shell customer-status"><AlertTriangle aria-hidden="true" /><span>{copy.formalCheck}</span><h1>{locale === "zh" ? "请确认你的房源信息" : "Confirm your property details"}</h1><p>{locale === "zh" ? "服务支持已将此请求交回给你。请核对房源、房型及原查询条件后继续，恢复原请求不会重复扣除额度。" : "Service support has returned this request to you. Confirm the property, room and original query before continuing. Resuming this request does not consume another allowance."}</p><Link className="button button-primary" href={`/${locale}/check/${checkId}/${check.confirmationStep}`}>{locale === "zh" ? "确认并继续" : "Confirm and continue"}<ArrowRight aria-hidden="true" /></Link></div></section></section>;
  }
  if (!check.terminal) {
    return (
      <section className="customer-check-page">
        <section className="customer-status-band">
          <div className="rough-shell customer-status">
            <LoaderCircle className="spin" aria-hidden="true" />
            <span>{copy.formalCheck}</span>
            <h1>{statusCopy}</h1>
            <p>{copy.processingBody}</p>
            <div className="customer-context"><strong>{check.property?.canonicalName}</strong>{!check.locationScope ? <span>{check.unit?.officialName}</span> : null}</div>
            {check.locationScope ? <LocationSummary locale={locale} check={check} /> : null}
          </div>
        </section>
        <RealProgress locale={locale} status={check.status} />
      </section>
    );
  }

  if (check.status !== "PUBLISHED" || !check.result) {
    if (check.availability?.length) return <section className="rough-shell customer-check-page"><h1>{locale === "zh" ? "来源显示所选日期已售罄" : "Sources show no availability for these dates"}</h1><p>{locale === "zh" ? "这是来源返回的有效可售状态，已计入本次查询额度；当前没有可展示的房价或调价建议。其他渠道仍可能有房，以下状态以检查时间为准。" : "This confirmed availability result counts as a query. There is no observed price or rate recommendation. Other channels may still have availability; each observation is accurate as of the time shown."}</p><div className="observed-price-list">{check.availability.map(item => <article key={item.id}><strong>{item.dataSource.name}</strong><p>{item.checkIn.slice(0, 10)}–{item.checkOut.slice(0, 10)}</p><p>{copy.checkedAt}: {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }).format(new Date(item.collectedAt))}</p><a href={item.sourceUrl} target="_blank" rel="noreferrer">{copy.viewSource}</a></article>)}</div><Link className="button button-secondary" href={`/${locale}/account`}>{copy.allChecks}</Link></section>;
    return <>{check.locationScope ? <div className="rough-shell"><LocationSummary locale={locale} check={check} /><Link className="text-link" href={`/${locale}/address-check`}>{locale === "zh" ? "修改位置或入住条件后重新查询" : "Change your location or stay details"}</Link></div> : null}<AccountState locale={locale} title={statusCopy} body={copy.terminalBody} /></>;
  }

  const money = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
  return (
    <section className="customer-check-page">
      {check.locationScope ? <div className="rough-shell"><LocationSummary locale={locale} check={check} /></div> : null}
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
        <div className="formal-section-heading"><span>{copy.observedEyebrow}</span><h2 id="observed-price-heading">{check.analysisType === "LOCATION_BENCHMARK" ? (locale === "zh" ? "区域公开价格" : "Observed local prices") : copy.observedTitle}</h2><p>{check.analysisType === "LOCATION_BENCHMARK" ? (locale === "zh" ? "展示查询范围内实际采集到的公开 OTA 价格；不同价格口径分别展示。" : "Public OTA prices observed within the search area are shown separately for each price basis.") : copy.observedBody}</p></div>
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
          {check.result.memberReview?.length ? <section className="membership-quote"><h3>{locale === "zh" ? "按你的策略生成的参考范围" : "Review range under your strategy"}</h3>{check.result.memberReview.map(item => <p key={item.insightId}>{item.range ? `${money.format(item.range.lowMinor / 100)}–${money.format(item.range.highMinor / 100)}` : locale === "zh" ? "没有同时满足证据和策略限制的建议。" : "No recommendation satisfies both the evidence and your strategy limits."}</p>)}</section> : null}
          <div className="flow-actions"><Link className="button button-secondary" href={`/${locale}/account`}>{copy.allChecks}</Link><Link className="button button-primary" href={`/${locale}/address-check`}>{copy.another}<ArrowRight aria-hidden="true" /></Link></div>
        </div>
      </section>
    </section>
  );
}

function LocationSummary({ locale, check }: { locale: Locale; check: CustomerCheck }) {
  const zh = locale === "zh";
  return <div className="location-selected"><div><strong>{check.locationScope?.label}</strong><p>{check.locationScope?.kind === "SUBURB_BOUNDARY" ? (zh ? "查询范围：所选区的 LINZ 边界内，未扩大范围。" : "Search area: the selected LINZ suburb boundary, without expansion.") : (zh ? "查询范围：该地址周边 5 公里。" : "Search area: within 5 km of this address.")}</p>{check.result?.sampleCount != null ? <p>{zh ? `已观测房源：${check.result.sampleCount} 个。` : `Properties observed: ${check.result.sampleCount}.`}</p> : null}{check.result?.sampleCount != null && check.result.sampleCount < 3 ? <p>{zh ? "样本不足，以下个别报价不能代表区域行情。可返回更换区域或入住日期。" : "Too few samples to represent the local market. Try another area or stay dates."}</p> : null}<Link className="text-link" href={`/${locale}/account`}>{zh ? "返回会员首页" : "Back to account home"}</Link></div></div>;
}

export function RealProgress({ locale, status }: { locale: Locale; status: string }) {
  const copy = accountCopy[locale];
  const stages = ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING"];
  const current = Math.max(0, stages.indexOf(status));
  return <section className="customer-progress-band"><div className="rough-shell customer-progress">{copy.progress.map((label, index) => <div className={index <= current ? "is-active" : ""} key={label}><span>{index < current ? <CheckCircle2 aria-hidden="true" /> : index + 1}</span><strong>{label}</strong></div>)}</div></section>;
}
