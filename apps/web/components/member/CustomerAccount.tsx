"use client";

import { AlertTriangle, ArrowRight, Clock3, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Locale, CheckListItem, MembershipSummary, ApiPayload } from "./contracts";
import { MembershipPanel } from "./MembershipPanel";
import { accountCopy } from "./AccountState";

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
        {checks?.length === 0 ? <div className="account-empty"><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><Link className="button button-primary" href={`/${locale}/address-check`}>{copy.another}</Link></div> : null}
        {checks?.length ? <div className="account-check-list">{checks.map((check) => <Link href={`/${locale}/account/checks/${check.id}`} key={check.id}><span>{check.property?.canonicalName ?? copy.unknownProperty}</span><strong>{check.status}</strong><small>{check.unit?.officialName}</small><ArrowRight aria-hidden="true" /></Link>)}</div> : null}
        {membership ? <MembershipPanel locale={locale} membership={membership} /> : null}
      </div>
    </section>
  );
}
