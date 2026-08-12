"use client";

import { AlertTriangle, BarChart3, CheckCircle2, Clock3, LoaderCircle, ShieldCheck, ThumbsUp } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Locale = "en" | "zh";

type ResultInsight = {
  id: string;
  stayDate: string;
  risk: string;
  reasonCodes: string[];
  targetPriceMinor: number | null;
  competitorMedianMinor: number | null;
  competitorLowMinor: number | null;
  competitorHighMinor: number | null;
  recommendedAction: string;
  confidence: string;
  limitations: string[];
  explanation: { whatChanged?: string; whyItMatters?: string; suggestedAction?: string };
};

export type ResolvedResult = {
  state: "VALID" | "INVALID" | "EXPIRED" | "WITHDRAWN" | "SUPERSEDED";
  result: null | {
    id: string;
    outcome: string;
    confidence: string;
    dataLastCheckedAt: string | null;
    analysisVersion: string;
    isDemo: boolean;
    payload: Record<string, unknown>;
    priceCheck: {
      id: string;
      locale: string;
      status: string;
      property: { canonicalName: string } | null;
      unit: { officialName: string } | null;
      stayQuery: { checkIn: string; checkOut: string; nights: number; adults: number; children: number; units: number; currency: string; timezone: string } | null;
    };
    insights: ResultInsight[];
  };
};

export function ResultView({ locale, token, resolved }: { locale: Locale; token: string; resolved: ResolvedResult }) {
  const t = useTranslations("Result");
  const format = useFormatter();
  if (!resolved.result) return <ResultState locale={locale} icon={<Clock3 size={30} />} title={t(`state.${resolved.state}.title`)} body={t(`state.${resolved.state}.body`)} />;

  const result = resolved.result;
  const propertyName = result.priceCheck.property?.canonicalName ?? t("propertyUnavailable");
  const unitName = result.priceCheck.unit?.officialName ?? t("unitUnavailable");
  const addressCoverage = resultAddressCoverage(result.payload);

  return (
    <section className="result-page">
      <div className="result-container">
        {result.isDemo ? <div className="demo-banner"><ShieldCheck size={18} /><strong>{t("demoLabel")}</strong><span>{t("demoBody")}</span></div> : null}
        {resolved.state === "SUPERSEDED" ? <div className="flow-notice notice-warning"><AlertTriangle size={20} /><div><strong>{t("supersededTitle")}</strong><p>{t("supersededBody")}</p></div></div> : null}
        {addressCoverage ? <div className={`flow-notice ${addressCoverage.level === "FULL" ? "notice-success" : "notice-warning"}`}>
          {addressCoverage.level === "FULL" ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}
          <div><strong>{t(`coverage.${addressCoverage.level}.title`)}</strong><p>{t(`coverage.${addressCoverage.level}.body`, { market: addressCoverage.marketName })}</p></div>
        </div> : null}
        <header className="result-heading">
          <div><span>{t("eyebrow")}</span><h1>{t("title")}</h1><p>{propertyName} · {unitName}</p></div>
          <div className={`confidence-badge confidence-${result.confidence.toLowerCase()}`}><span>{t("confidence")}</span><strong>{t(`confidenceValue.${result.confidence}`)}</strong></div>
        </header>
        <div className="result-meta">
          <span><Clock3 size={16} />{t("lastChecked", { date: result.dataLastCheckedAt ? format.dateTime(new Date(result.dataLastCheckedAt), { dateStyle: "medium", timeStyle: "short" }) : t("unknown") })}</span>
          <span>{t("analysisVersion", { version: result.analysisVersion })}</span>
        </div>
        <div className="insight-list">
          {result.insights.length ? result.insights.map((insight) => (
            <article className="insight-card" key={insight.id}>
              <div className="insight-card-head"><div><span>{format.dateTime(new Date(insight.stayDate), { dateStyle: "full" })}</span><h2>{t(`risk.${insight.risk}`)}</h2></div><BarChart3 size={24} /></div>
              <div className="price-comparison">
                <Metric label={t("targetRate")} value={money(insight.targetPriceMinor, format)} />
                <Metric label={t("comparableMedian")} value={money(insight.competitorMedianMinor, format)} emphasized />
                <Metric label={t("comparableRange")} value={rangeMoney(insight.competitorLowMinor, insight.competitorHighMinor, format)} />
              </div>
              <div className="explanation-grid"><div><h3>{t("whatChanged")}</h3><p>{localizedExplanation(locale, insight.explanation.whatChanged, t("localizedExplanation.whatChanged"), t("notAvailable"))}</p></div><div><h3>{t("whyItMatters")}</h3><p>{localizedExplanation(locale, insight.explanation.whyItMatters, t("localizedExplanation.whyItMatters"), t("notAvailable"))}</p></div><div><h3>{t("suggestedAction")}</h3><p>{localizedExplanation(locale, insight.explanation.suggestedAction, t("localizedExplanation.suggestedAction"), t(`action.${insight.recommendedAction}`))}</p></div></div>
              {insight.limitations.length ? <div className="limitations"><AlertTriangle size={17} /><div><strong>{t("limitations")}</strong><ul>{insight.limitations.map((item, index) => <li key={`${item}:${index}`}>{locale === "zh" ? t("localizedExplanation.limitation") : item}</li>)}</ul></div></div> : null}
              <FeedbackForm insightId={insight.id} token={token} />
            </article>
          )) : <div className="empty-result"><CheckCircle2 size={28} /><h2>{t("noPriorityTitle")}</h2><p>{t("noPriorityBody")}</p></div>}
        </div>
        <div className="result-disclaimer"><ShieldCheck size={20} /><p>{t("disclaimer")}</p></div>
        <Link className="button button-secondary" href={`/${locale}/check`}>{t("newCheck")}</Link>
      </div>
    </section>
  );
}

function resultAddressCoverage(payload: Record<string, unknown>) {
  const publicSignalCoverage = recordValue(payload.publicSignalCoverage);
  const addressCoverage = recordValue(publicSignalCoverage.addressCoverage);
  const level = addressCoverage.level;
  const marketName = addressCoverage.marketName;
  if ((level !== "FULL" && level !== "REGIONAL" && level !== "NATIONAL_ONLY") || typeof marketName !== "string") return null;
  return { level, marketName } as const;
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function FeedbackForm({ insightId, token }: { insightId: string; token: string }) {
  const t = useTranslations("Result");
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => setHydrated(true), []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setState("sending");
    const response = await fetch(`/api/v1/results/${encodeURIComponent(token)}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        insightId,
        feedbackType: String(form.get("feedbackType")),
        comment: String(form.get("comment") ?? "") || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setState(response.ok ? "sent" : "error");
  }

  if (state === "sent") return <div className="feedback-success" role="status"><CheckCircle2 size={18} />{t("feedbackThanks")}</div>;
  return (
    <form className="feedback-form" onSubmit={submit} data-hydrated={hydrated ? "true" : "false"}>
      <h3><ThumbsUp size={18} />{t("feedbackTitle")}</h3>
      <div className="feedback-options">
        <label><input type="radio" name="feedbackType" value="INSIGHT_USEFUL" required />{t("feedbackUseful")}</label>
        <label><input type="radio" name="feedbackType" value="NO_ACTION_NEEDED" required />{t("feedbackNoAction")}</label>
        <label><input type="radio" name="feedbackType" value="REPORT_ISSUE" required />{t("feedbackIssue")}</label>
      </div>
      <textarea name="comment" maxLength={2_000} placeholder={t("feedbackComment")} />
      {state === "error" ? <p className="form-error" role="alert">{t("feedbackError")}</p> : null}
      <button className="button button-secondary" type="submit" disabled={state === "sending"}>{state === "sending" ? <LoaderCircle className="spin" size={17} /> : null}{t("feedbackSubmit")}</button>
    </form>
  );
}

function ResultState({ locale, icon, title, body }: { locale: Locale; icon: React.ReactNode; title: string; body: string }) {
  const t = useTranslations("Result");
  return <section className="result-state"><div>{icon}<h1>{title}</h1><p>{body}</p><Link className="button button-primary" href={`/${locale}/check`}>{t("newCheck")}</Link></div></section>;
}

function Metric({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <div className={emphasized ? "metric-emphasized" : undefined}><span>{label}</span><strong>{value}</strong></div>;
}

function money(value: number | null, formatter: ReturnType<typeof useFormatter>) {
  return value === null ? "—" : formatter.number(value / 100, { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
}

function rangeMoney(low: number | null, high: number | null, formatter: ReturnType<typeof useFormatter>) {
  if (low === null || high === null) return "—";
  return `${money(low, formatter)} – ${money(high, formatter)}`;
}

function localizedExplanation(
  locale: Locale,
  value: string | undefined,
  translated: string,
  fallback: string,
) {
  return locale === "zh" ? translated : value ?? fallback;
}
