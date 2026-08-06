"use client";

import { motion, useReducedMotion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ExternalLink, LoaderCircle, LockKeyhole, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";

type Locale = "en" | "zh";

type RoughCheck = {
  id: string;
  platform: string;
  listingId: string;
  status: string;
  pricingContext: {
    source: "URL" | "OTA_DEFAULT";
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    units: number;
    currency: string;
  };
  isDemo: boolean;
  completedStages: string[];
  roughResult: null | {
    propertyName: string;
    locality: string;
    unitName: string;
    pricePosition: string;
    estimatedGapLowPct: number | null;
    estimatedGapHighPct: number | null;
    observedPriceMinor: number | null;
    marketLowMinor: number | null;
    marketHighMinor: number | null;
    currency: string;
    confidence: string;
    sourceLabel: string;
    capturedAt: string;
    limitations: string[];
    isDemo: boolean;
  };
};

type Challenge = { mode: "deterministic" | "managed"; token?: string; siteKey?: string };
type ApiPayload<T> = { data?: T; error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]>; details?: { challenge?: Challenge } } };

export function AnonymousCheckStart({ locale, initialInput = "" }: { locale: Locale; initialInput?: string }) {
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const [input, setInput] = useState(initialInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const copy = roughCopy[locale];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/rough-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: input.trim(), locale, idempotencyKey: requestKey.current ??= crypto.randomUUID(), ...(challenge?.token ? { challengeToken: challenge.token } : {}) }),
      });
      const payload = await response.json() as ApiPayload<{ id: string }>;
      if (!response.ok || !payload.data) {
        if (payload.error?.code === "ROUGH_CHECK_CHALLENGE_REQUIRED" && payload.error.details?.challenge) {
          setChallenge(payload.error.details.challenge);
          return;
        }
        setError(payload.error?.fieldErrors?.input?.[0] ?? payload.error?.message ?? copy.genericError);
        return;
      }
      router.push(`/${locale}/rough/${payload.data.id}`);
    } catch {
      setError(copy.genericError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rough-entry">
      <div className="rough-shell narrow">
        <span className="rough-eyebrow">{copy.eyebrow}</span>
        <h1>{copy.entryTitle}</h1>
        <p>{copy.entryBody}</p>
        <form className="rough-entry-form" onSubmit={submit} noValidate>
          <label htmlFor="rough-listing-url">{copy.urlLabel}</label>
          <div className="rough-url-control">
            <Search aria-hidden="true" />
            <input id="rough-listing-url" type="url" value={input} onChange={(event) => { setInput(event.target.value); requestKey.current = null; setChallenge(null); }} placeholder={copy.urlPlaceholder} required disabled={busy} />
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <ArrowRight />}{busy ? copy.checking : challenge ? (locale === "zh" ? "完成验证并继续" : "Complete verification") : copy.checkAction}</button>
          </div>
          <p className="rough-field-hint">{copy.urlHint}</p>
          <p className="rough-field-hint"><Link className="text-link" href={`/${locale}/address-check`}>{copy.addressStart}</Link></p>
          {error ? <p className="field-error" role="alert">{error}</p> : null}
          {challenge ? <div className="rough-demo" data-testid="rough-entry-challenge"><ShieldCheck aria-hidden="true" /><strong>{locale === "zh" ? "需要额外验证" : "Additional verification required"}</strong><span>{challenge.mode === "deterministic" ? (locale === "zh" ? "点击按钮完成本地验证。" : "Use the button to complete the local verification.") : (locale === "zh" ? "请先完成托管验证。" : "Complete the managed verification before retrying.")}</span></div> : null}
        </form>
      </div>
    </section>
  );
}

export function RoughResultExperience({ locale, checkId }: { locale: Locale; checkId: string }) {
  const copy = roughCopy[locale];
  const reduceMotion = useReducedMotion();
  const [check, setCheck] = useState<RoughCheck | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void fetch(`/api/v1/rough-checks/${checkId}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as ApiPayload<RoughCheck>;
        if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? copy.genericError);
        if (active) setCheck(payload.data);
      })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : copy.genericError); });
    return () => { active = false; };
  }, [checkId, copy.genericError]);

  if (error) return <RoughState locale={locale} title={copy.unavailableTitle} body={error} />;
  if (!check) return <RoughLoading locale={locale} />;
  if (check.status !== "ROUGH_READY" || !check.roughResult) {
    return <RoughState locale={locale} title={copy.noQuoteTitle} body={copy.noQuoteBody} />;
  }

  const result = check.roughResult;
  const context = check.pricingContext;
  const money = new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-NZ", { style: "currency", currency: result.currency, maximumFractionDigits: 0 });
  const position = result.pricePosition === "POSSIBLY_LOW" ? copy.possiblyLow : result.pricePosition === "NEAR_RANGE" ? copy.nearRange : copy.unclear;

  return (
    <main className="rough-result-page">
      <section className="rough-progress-band" aria-label={copy.progressLabel}>
        <div className="rough-shell rough-stage-grid">
          {copy.stages.map((stage, index) => (
            <motion.div
              key={stage}
              initial={reduceMotion ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: reduceMotion ? 0 : index * 0.05 }}
              className="rough-stage is-complete"
            >
              <span><Check aria-hidden="true" /></span><strong>{stage}</strong>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="rough-summary-band">
        <div className="rough-shell rough-summary-grid">
          <div className="rough-summary-copy">
            <span className="rough-eyebrow">{copy.preliminary}</span>
            <h1>{result.propertyName}</h1>
            <p>{result.unitName} · {result.locality}</p>
            <div className="rough-position"><span>{copy.positionLabel}</span><strong>{position}</strong></div>
            <p className="rough-limitation">{copy.roughLimitation}</p>
          </div>
          <motion.div
            className="rough-signal"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35 }}
          >
            <span>{copy.estimatedGap}</span>
            <strong>{result.estimatedGapLowPct ?? 0}-{result.estimatedGapHighPct ?? 0}%</strong>
            <p>{copy.gapBody}</p>
          </motion.div>
        </div>
      </section>

      <section className="rough-evidence-band">
        <div className="rough-shell">
          {check.isDemo ? <div className="rough-demo"><AlertTriangle aria-hidden="true" /><strong>{copy.demoTitle}</strong><span>{copy.demoBody}</span></div> : null}
          <div className="rough-metrics">
            <div><span>{copy.observedPrice}</span><strong>{result.observedPriceMinor == null ? "-" : money.format(result.observedPriceMinor / 100)}</strong></div>
            <div><span>{copy.broadRange}</span><strong>{result.marketLowMinor == null || result.marketHighMinor == null ? "-" : `${money.format(result.marketLowMinor / 100)}-${money.format(result.marketHighMinor / 100)}`}</strong></div>
            <div><span>{copy.confidence}</span><strong>{result.confidence}</strong></div>
          </div>
          <div className="rough-context">
            <div><strong>{copy.contextTitle}</strong><p>{context.checkIn} → {context.checkOut} · {context.adults} {copy.adults} · {context.units} {context.units === 1 ? copy.unit : copy.units}</p></div>
            <span>{context.source === "URL" ? copy.urlContext : copy.defaultContext}</span>
          </div>
          <p className="rough-source">{copy.captured}: {new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.capturedAt))} · {result.sourceLabel}</p>
        </div>
      </section>

      <UnlockPanel locale={locale} checkId={check.id} />
    </main>
  );
}

function UnlockPanel({ locale, checkId }: { locale: Locale; checkId: string }) {
  const copy = roughCopy[locale];
  const requestKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/v1/rough-checks/${checkId}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: String(form.get("email") ?? ""),
          serviceConsent: form.get("serviceConsent") === "on",
          marketingConsent: form.get("marketingConsent") === "on",
          idempotencyKey: requestKey.current ??= crypto.randomUUID(),
        }),
      });
      const payload = await response.json() as ApiPayload<{ accepted: boolean }>;
      if (!response.ok || !payload.data) {
        setError(Object.values(payload.error?.fieldErrors ?? {}).flat()[0] ?? payload.error?.message ?? copy.genericError);
        return;
      }
      setSent(true);
    } catch {
      setError(copy.genericError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rough-unlock-band" aria-labelledby="rough-unlock-title">
      <div className="rough-shell rough-unlock-grid">
        <div>
          <span className="rough-eyebrow"><LockKeyhole aria-hidden="true" />{copy.secureAccess}</span>
          <h2 id="rough-unlock-title">{copy.unlockTitle}</h2>
          <p>{copy.unlockBody}</p>
          <ul>{copy.formalAdds.map((item) => <li key={item}><CheckCircle2 aria-hidden="true" />{item}</li>)}</ul>
        </div>
        {sent ? (
          <div className="rough-email-sent" role="status"><ShieldCheck aria-hidden="true" /><h3>{copy.emailSentTitle}</h3><p>{copy.emailSentBody}</p>{process.env.NODE_ENV === "development" ? <a className="button button-secondary" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">{copy.openInbox}<ExternalLink aria-hidden="true" /></a> : null}</div>
        ) : (
          <form className="rough-unlock-form" onSubmit={submit} noValidate>
            <label htmlFor="rough-email">{copy.emailLabel}</label>
            <input id="rough-email" name="email" type="email" autoComplete="email" placeholder={copy.emailPlaceholder} required />
            <p>{copy.accountDisclosure}</p>
            <label className="check-control"><input name="serviceConsent" type="checkbox" required /><span>{copy.serviceConsent}</span></label>
            <label className="check-control"><input name="marketingConsent" type="checkbox" /><span>{copy.marketingConsent}</span></label>
            {error ? <p className="field-error" role="alert">{error}</p> : null}
            <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" /> : <LockKeyhole />}{busy ? copy.sending : copy.unlockAction}</button>
            <small>{copy.emailCount}</small>
          </form>
        )}
      </div>
    </section>
  );
}

function RoughLoading({ locale }: { locale: Locale }) {
  const copy = roughCopy[locale];
  return <section className="rough-loading" role="status"><LoaderCircle className="spin" aria-hidden="true" /><h1>{copy.loadingTitle}</h1><p>{copy.loadingBody}</p></section>;
}

function RoughState({ locale, title, body }: { locale: Locale; title: string; body: string }) {
  const copy = roughCopy[locale];
  return <section className="rough-loading"><AlertTriangle aria-hidden="true" /><h1>{title}</h1><p>{body}</p><Link className="button button-primary" href={`/${locale}/check`}>{copy.tryAnother}</Link></section>;
}

const roughCopy = {
  en: {
    eyebrow: "PRELIMINARY PRICE SIGNAL", entryTitle: "Check an OTA listing", entryBody: "Paste a supported listing link. Tymra uses its URL context or default public display without asking you to configure dates, guests or room type.", urlLabel: "Supported OTA listing URL", urlPlaceholder: "https://www.booking.com/hotel/nz/...", urlHint: "Booking.com, Airbnb, Expedia, Wotif, Hotels.com, Bookabach, Vrbo, Agoda and Trip.com public accommodation links are supported.", addressStart: "Start from a New Zealand address instead", checkAction: "Check This Listing", checking: "Checking listing", genericError: "The request could not be completed. Please try again.", loadingTitle: "Opening your rough result", loadingBody: "Restoring the persisted listing check.", unavailableTitle: "This rough result is unavailable", noQuoteTitle: "No valid default quote was found", noQuoteBody: "The listing was recognised, but its default view did not provide enough reliable price evidence. Tymra will not invent a result.", tryAnother: "Try another listing", progressLabel: "Completed rough analysis stages", stages: ["Listing validated", "Default context captured", "Market range checked", "Preliminary signal ready"], preliminary: "ROUGH RESULT", positionLabel: "Preliminary position", possiblyLow: "Possibly below the market range", nearRange: "Near the observed range", unclear: "Unclear", roughLimitation: "This is an indicative snapshot, not the formal Price Check.", estimatedGap: "Possible gap band", gapBody: "Estimated against reliable aggregate evidence", demoTitle: "Development Demo Data", demoBody: "Not real market data. This local flow proves behaviour only.", observedPrice: "Default displayed price", broadRange: "Broad comparable range", confidence: "Preliminary confidence", contextTitle: "Configuration used automatically", adults: "adults", unit: "unit", units: "units", urlContext: "Configuration carried by the pasted link", defaultContext: "OTA default display configuration", captured: "Captured", secureAccess: "SECURE CUSTOMER ACCESS", unlockTitle: "Unlock the formal report", unlockBody: "Verify one email to start the formal provider check and keep the report in your customer account.", formalAdds: ["Exact priority dates and detailed comparable evidence", "Authenticated report history", "No password and no credit card"], emailLabel: "Email address", emailPlaceholder: "you@example.com", accountDisclosure: "Clicking the email link creates or resumes your Tymra customer account.", serviceConsent: "I agree to the account terms and service messages required to deliver this report.", marketingConsent: "I would also like occasional product updates (optional).", unlockAction: "Email My Secure Link", sending: "Sending secure link", emailCount: "The normal flow sends one verification email. A result email is sent only if you do not receive the result in-page.", emailSentTitle: "Check your email", emailSentBody: "If this request is eligible, a 15-minute secure link has been sent. Use it to sign in and start the formal check.", openInbox: "Open local inbox",
  },
  zh: {
    eyebrow: "初步价格信号", entryTitle: "检查 OTA 房源", entryBody: "粘贴受支持的房源链接。Tymra 自动使用链接参数或默认公开展示，无需设置日期、人数或房型。", urlLabel: "受支持的 OTA 房源链接", urlPlaceholder: "https://www.booking.com/hotel/nz/...", urlHint: "支持 Booking.com、Airbnb、Expedia、Wotif、Hotels.com、Bookabach、Vrbo、Agoda 和 Trip.com 的公开住宿链接。", addressStart: "改为从新西兰地址开始", checkAction: "检查这个房源", checking: "正在检查", genericError: "请求暂时无法完成，请重试。", loadingTitle: "正在打开粗略结果", loadingBody: "正在恢复已保存的房源检查。", unavailableTitle: "这个粗略结果不可用", noQuoteTitle: "没有找到有效的默认报价", noQuoteBody: "系统识别了房源，但默认页面没有提供足够的可靠价格证据。Tymra 不会编造结果。", tryAnother: "检查其他房源", progressLabel: "已完成的粗略分析阶段", stages: ["房源链接已验证", "默认配置已捕获", "市场区间已检查", "初步信号已生成"], preliminary: "粗略结果", positionLabel: "初步价格位置", possiblyLow: "可能低于市场区间", nearRange: "接近观察区间", unclear: "暂不明确", roughLimitation: "这是提示性快照，不是正式价格检查。", estimatedGap: "可能的差距范围", gapBody: "基于可靠的聚合证据估算", demoTitle: "开发演示数据", demoBody: "不是真实市场数据，仅用于验证本地流程。", observedPrice: "默认展示价格", broadRange: "宽泛竞品区间", confidence: "初步置信度", contextTitle: "系统自动采用的配置", adults: "位成人", unit: "个单位", units: "个单位", urlContext: "使用链接携带的配置", defaultContext: "使用 OTA 默认展示配置", captured: "采集时间", secureAccess: "安全客户访问", unlockTitle: "解锁正式报告", unlockBody: "验证一次邮箱即可开始正式数据检查，并把报告保存在你的客户账户中。", formalAdds: ["准确的重点日期和详细竞品证据", "需要登录的报告历史", "无需密码和信用卡"], emailLabel: "电子邮箱", emailPlaceholder: "you@example.com", accountDisclosure: "点击邮件链接会创建或恢复你的 Tymra 客户账户。", serviceConsent: "我同意账户条款和交付本报告所需的服务消息。", marketingConsent: "我也愿意接收偶尔的产品更新（选填）。", unlockAction: "发送安全链接", sending: "正在发送", emailCount: "正常流程只发送一封验证邮件；只有页面内未收到结果时，才会再发送结果邮件。", emailSentTitle: "请检查邮箱", emailSentBody: "符合条件的请求会收到一封 15 分钟有效的安全链接。点击后登录并开始正式检查。", openInbox: "打开本地邮箱",
  },
} as const;
