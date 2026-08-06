"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, LoaderCircle, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Locale = "en" | "zh";
type CustomerCheck = {
  id: string;
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

type CheckListItem = Pick<CustomerCheck, "id" | "status" | "createdAt" | "isDemo" | "property" | "unit">;
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
    const poll = async () => {
      try {
        const current = await load();
        if (active && !current.terminal) timer = window.setTimeout(poll, 2_000);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : copy.loadError);
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
      <main className="customer-check-page">
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
      </main>
    );
  }

  if (check.status !== "PUBLISHED" || !check.result) {
    return <AccountState locale={locale} title={statusCopy} body={copy.terminalBody} />;
  }

  const money = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
  return (
    <main className="customer-check-page">
      <section className="formal-result-header">
        <div className="rough-shell formal-result-heading">
          <span className="rough-eyebrow"><ShieldCheck aria-hidden="true" />{copy.secureReport}</span>
          <h1>{check.property?.canonicalName}</h1>
          <p>{check.unit?.officialName} · {check.property?.city}</p>
          <div className="formal-result-meta"><span>{copy.confidence}: <strong>{check.result.confidence}</strong></span><span>{copy.version}: {check.result.version}</span><span>{copy.generated}: {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(check.result.generatedAt))}</span></div>
        </div>
      </section>
      {check.isDemo ? <div className="rough-shell rough-demo formal-demo"><AlertTriangle aria-hidden="true" /><strong>{copy.demoTitle}</strong><span>{copy.demoBody}</span></div> : null}
      <section className="formal-insights-band">
        <div className="rough-shell">
          <div className="formal-section-heading"><span>{copy.priorityEyebrow}</span><h2>{copy.priorityTitle}</h2><p>{copy.priorityBody}</p></div>
          {check.result.insights.length ? <div className="formal-insight-list">{check.result.insights.map((insight) => (
            <article key={insight.id} className="formal-insight-row">
              <div><span>{new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "full" }).format(new Date(insight.stayDate))}</span><strong>{copy.risk[insight.risk as keyof typeof copy.risk] ?? insight.risk}</strong></div>
              <div><span>{copy.target}</span><strong>{insight.targetPriceMinor == null ? "-" : money.format(insight.targetPriceMinor / 100)}</strong></div>
              <div><span>{copy.comparable}</span><strong>{insight.competitorLowMinor == null || insight.competitorHighMinor == null ? "-" : `${money.format(insight.competitorLowMinor / 100)}-${money.format(insight.competitorHighMinor / 100)}`}</strong></div>
              <div><span>{copy.action}</span><strong>{copy.actionValue}</strong></div>
            </article>
          ))}</div> : <p>{copy.noInsights}</p>}
          <div className="formal-disclaimer"><AlertTriangle aria-hidden="true" /><p>{copy.disclaimer}</p></div>
          <div className="flow-actions"><Link className="button button-secondary" href={`/${locale}/account`}>{copy.allChecks}</Link><Link className="button button-primary" href={`/${locale}/check`}>{copy.another}<ArrowRight aria-hidden="true" /></Link></div>
        </div>
      </section>
    </main>
  );
}

export function CustomerAccount({ locale, quotaReached = false }: { locale: Locale; quotaReached?: boolean }) {
  const copy = accountCopy[locale];
  const [checks, setChecks] = useState<CheckListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void fetch("/api/v1/customer/checks", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as ApiPayload<CheckListItem[]>;
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.loadError);
        setChecks(payload.data);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : copy.loadError));
  }, [copy.loadError]);

  return (
    <main className="account-page">
      <div className="rough-shell">
        <span className="rough-eyebrow">{copy.accountEyebrow}</span><h1>{copy.accountTitle}</h1><p>{copy.accountBody}</p>
        {quotaReached ? <div className="flow-notice notice-warning"><Clock3 aria-hidden="true" /><div><strong>{copy.quotaTitle}</strong><p>{copy.quotaBody}</p></div></div> : null}
        {error ? <div className="flow-notice notice-danger"><AlertTriangle aria-hidden="true" /><div><strong>{copy.accessTitle}</strong><p>{error}</p></div></div> : null}
        {!checks && !error ? <div className="loading-state"><LoaderCircle className="spin" /><span>{copy.loadingTitle}</span></div> : null}
        {checks?.length === 0 ? <div className="account-empty"><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><Link className="button button-primary" href={`/${locale}/check`}>{copy.another}</Link></div> : null}
        {checks?.length ? <div className="account-check-list">{checks.map((check) => <Link href={`/${locale}/account/checks/${check.id}`} key={check.id}><span>{check.property?.canonicalName ?? copy.unknownProperty}</span><strong>{check.status}</strong><small>{check.unit?.officialName}</small><ArrowRight aria-hidden="true" /></Link>)}</div> : null}
      </div>
    </main>
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
    loadError: "Your secure customer session could not be verified.", accessTitle: "Secure access required", loadingTitle: "Opening your formal Price Check", loadingBody: "Checking the latest persisted status.", formalCheck: "FORMAL PRICE CHECK", processingBody: "You can leave this page. The check keeps running, and one result email is sent only when the result is not delivered here.", terminalBody: "The formal check reached a limited terminal state. No price was invented.", secureReport: "AUTHENTICATED FORMAL REPORT", confidence: "Confidence", version: "Analysis version", generated: "Generated", demoTitle: "Development Demo Data", demoBody: "Not real market data. This local report proves the authenticated workflow only.", priorityEyebrow: "PRIORITY REVIEW", priorityTitle: "Dates that may deserve attention", priorityBody: "The formal report exposes the exact evidence reserved from the rough result.", target: "Target signal", comparable: "Comparable range", action: "Suggested action", actionValue: "Review the current rate", noInsights: "No priority dates were identified.", disclaimer: "Decision support only. Prices and availability can change after collection; Tymra does not guarantee revenue or bookings.", allChecks: "All checks", another: "Check another listing", home: "Return home", accountEyebrow: "CUSTOMER ACCOUNT", accountTitle: "Your Price Checks", accountBody: "Reports are protected by your customer session and visible only to you.", quotaTitle: "Formal check quota reached", quotaBody: "Your account is active, but another formal provider check is not available yet. The pilot allows the included first check, then one per day and five in a rolling 30 days.", emptyTitle: "No Price Checks yet", emptyBody: "Start with a supported OTA listing link.", unknownProperty: "Price Check", progress: ["Queued", "Collecting source data", "Normalizing", "Analysing", "Quality checking"], status: { QUEUED: "Queued", COLLECTING: "Collecting source data", NORMALIZING: "Normalizing prices", ANALYSING: "Analysing comparable evidence", AUTO_VALIDATING: "Quality checking", EXCEPTION: "Additional checks in progress", PUBLISHED: "Published", PARTIAL: "Partial result", INSUFFICIENT_DATA: "Insufficient data", SOURCE_UNAVAILABLE: "Source unavailable", FAILED: "Check failed" }, risk: { HIGH_PRIORITY: "High priority", REVIEW: "Review", WATCH: "Watch", NO_CLEAR_RISK: "No clear risk" },
  },
  zh: {
    loadError: "无法验证你的安全客户会话。", accessTitle: "需要安全访问", loadingTitle: "正在打开正式价格检查", loadingBody: "正在获取最新的已保存状态。", formalCheck: "正式价格检查", processingBody: "你可以离开此页面。检查会继续运行；只有结果没有在此页面交付时，系统才会发送一封结果邮件。", terminalBody: "正式检查进入了受限终态。系统没有编造价格。", secureReport: "需要登录的正式报告", confidence: "置信度", version: "分析版本", generated: "生成时间", demoTitle: "开发演示数据", demoBody: "不是真实市场数据，仅用于验证需要登录的本地流程。", priorityEyebrow: "重点复核", priorityTitle: "可能需要关注的日期", priorityBody: "正式报告会展示粗略结果中保留的准确证据。", target: "目标信号", comparable: "竞品区间", action: "建议动作", actionValue: "复核当前房价", noInsights: "没有识别出重点日期。", disclaimer: "仅供决策支持。采集后价格和可售状态可能变化；Tymra 不保证收入或预订。", allChecks: "全部检查", another: "检查其他房源", home: "返回首页", accountEyebrow: "客户账户", accountTitle: "你的价格检查", accountBody: "报告由客户会话保护，只有你可以查看。", quotaTitle: "已达到正式检查额度", quotaBody: "你的账户已经启用，但暂时不能开始新的正式数据检查。试点额度包含首次检查，此后每天一次、滚动 30 天最多五次。", emptyTitle: "还没有价格检查", emptyBody: "请从一个受支持的 OTA 房源链接开始。", unknownProperty: "价格检查", progress: ["已排队", "采集来源数据", "价格标准化", "分析竞品证据", "质量检查"], status: { QUEUED: "已排队", COLLECTING: "正在采集来源数据", NORMALIZING: "正在标准化价格", ANALYSING: "正在分析竞品证据", AUTO_VALIDATING: "正在进行质量检查", EXCEPTION: "正在进行额外检查", PUBLISHED: "已发布", PARTIAL: "部分结果", INSUFFICIENT_DATA: "数据不足", SOURCE_UNAVAILABLE: "数据源不可用", FAILED: "检查失败" }, risk: { HIGH_PRIORITY: "高优先级", REVIEW: "建议复核", WATCH: "继续观察", NO_CLEAR_RISK: "没有明确风险" },
  },
} as const;
