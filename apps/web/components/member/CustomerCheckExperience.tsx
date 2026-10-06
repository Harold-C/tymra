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

export function RealProgress({ locale, status }: { locale: Locale; status: string }) {
  const copy = accountCopy[locale];
  const stages = ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING"];
  const current = Math.max(0, stages.indexOf(status));
  return <section className="customer-progress-band"><div className="rough-shell customer-progress">{copy.progress.map((label, index) => <div className={index <= current ? "is-active" : ""} key={label}><span>{index < current ? <CheckCircle2 aria-hidden="true" /> : index + 1}</span><strong>{label}</strong></div>)}</div></section>;
}
