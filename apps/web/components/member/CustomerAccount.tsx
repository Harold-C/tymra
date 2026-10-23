"use client";

import { AlertTriangle, ArrowRight, Clock3, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Locale, CheckListItem, MembershipSummary, ApiPayload } from "./contracts";
import { MembershipPanel } from "./MembershipPanel";
import { accountCopy } from "./AccountState";
import { CustomerEmailVerification } from "./CustomerEmailVerification";
import { overviewCopy } from "../../lib/account-overview";

export function CustomerAccount({ locale, blockedReason = null, emailVerified, verificationDelivery, showVerificationSuccess = false }: { locale: Locale; blockedReason?: string | null; emailVerified: boolean; verificationDelivery?: "sent" | "unavailable"; showVerificationSuccess?: boolean }) {
  const copy = accountCopy[locale];
  const t = overviewCopy[locale];
  const [checks, setChecks] = useState<CheckListItem[] | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setError(null);
    setNeedsSignIn(false);
    setMembership(null);
    setChecks(null);
    void Promise.all([
      fetch("/api/v1/customer/checks", { cache: "no-store", signal: controller.signal }),
      fetch("/api/v1/customer/membership", { cache: "no-store", signal: controller.signal }),
    ])
      .then(async ([checksResponse, membershipResponse]) => {
        const [checksPayload, membershipPayload] = await Promise.all([
          checksResponse.json() as Promise<ApiPayload<CheckListItem[]>>,
          membershipResponse.json() as Promise<ApiPayload<MembershipSummary>>,
        ]);
        if (checksResponse.status === 401 || membershipResponse.status === 401) throw new Error("CUSTOMER_AUTH_REQUIRED");
        if (!checksResponse.ok || !checksPayload.data) throw new Error(checksPayload.error?.message ?? copy.loadError);
        if (!membershipResponse.ok || !membershipPayload.data) throw new Error(membershipPayload.error?.message ?? copy.loadError);
        if (controller.signal.aborted) return;
        setChecks(checksPayload.data);
        setMembership(membershipPayload.data);
      })
      .catch((caught) => {
        if (disposed) return;
        const expired = caught instanceof Error && caught.message === "CUSTOMER_AUTH_REQUIRED";
        setNeedsSignIn(expired);
        setError(expired ? (locale === "zh" ? "登录会话已过期，请重新登录。" : "Your session has expired. Please sign in again.") : controller.signal.aborted ? (locale === "zh" ? "加载超时，请重试。" : "Loading timed out. Please retry.") : (locale === "zh" ? "暂时无法加载账户信息，请重试。" : "Your account could not be loaded. Please retry."));
      })
      .finally(() => window.clearTimeout(timeout));
    let disposed = false;
    return () => { disposed = true; window.clearTimeout(timeout); controller.abort(); };
  }, [copy.loadError, locale, retry]);

  return (
    <section className="account-page account-overview-page" lang={locale === "zh" ? "zh-CN" : "en-NZ"}>
      <div className="rough-shell">
        <span className="rough-eyebrow">{copy.accountEyebrow}</span><h1>{t.title}</h1><p>{t.body}</p>
        {!emailVerified || showVerificationSuccess ? <div id="account-email-verification"><CustomerEmailVerification locale={locale} verified={emailVerified} delivery={verificationDelivery} /></div> : null}
        {blockedReason ? <div className="flow-notice notice-warning"><Clock3 aria-hidden="true" /><div><strong>{copy.blocked[blockedReason as keyof typeof copy.blocked]?.title ?? copy.quotaTitle}</strong><p>{copy.blocked[blockedReason as keyof typeof copy.blocked]?.body ?? copy.quotaBody}</p></div></div> : null}
        {error ? <div className="flow-notice notice-danger" role="alert"><AlertTriangle aria-hidden="true" /><div><strong>{locale === "zh" ? "账户信息暂不可用" : "Account information unavailable"}</strong><p>{error}</p>{needsSignIn ? <Link className="button button-secondary" href={`/${locale}/sign-in?returnTo=${encodeURIComponent(`/${locale}/account`)}`}>{locale === "zh" ? "重新登录" : "Sign in again"}</Link> : <button className="button button-secondary" onClick={() => setRetry((value) => value + 1)}>{locale === "zh" ? "重试" : "Retry"}</button>}</div></div> : null}
        {!membership && !error ? <div className="loading-state" role="status"><LoaderCircle className="spin" aria-hidden="true" /><span>{locale === "zh" ? "正在加载账户总览" : "Loading account overview"}</span></div> : null}
        {membership ? <MembershipPanel locale={locale} membership={membership} overview checks={checks ?? []} emailVerified={emailVerified}>
          <section className="overview-section" aria-labelledby="account-checks-heading"><div className="overview-section-title"><h2 id="account-checks-heading">{t.recent}</h2><Link href={`/${locale}/account/checks`}>{t.allChecks}</Link></div>
            {checks?.length ? <div className="account-check-list">{checks.slice(0, 3).map((check) => <Link href={`/${locale}/account/checks/${check.id}`} key={check.id}><span>{check.property?.canonicalName ?? copy.unknownProperty}</span><strong>{copy.status[check.status as keyof typeof copy.status] ?? check.status}</strong><small>{check.unit?.officialName}</small><ArrowRight aria-hidden="true" /></Link>)}</div> : <div className="overview-empty"><h3>{t.noChecks}</h3><p>{t.noChecksBody}</p></div>}
          </section>
          {membership.plan !== "FREE" && membership.featureAvailability.alerts ? <section className="overview-section"><div className="overview-section-title"><h2>{t.alerts}</h2><Link href={`/${locale}/account/alerts`}>{t.alertStatus}</Link></div><p>{t.alertsBody}</p></section> : null}
        </MembershipPanel> : null}
      </div>
    </section>
  );
}
