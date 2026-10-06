"use client";

import { useEffect, useState } from "react";
import { MembershipPanel } from "../MembershipPanel";
import { type MembershipSummary } from "../contracts";
import { Page, Loading, ErrorState } from "./shared";
import type { Locale } from "../contracts";
import { api } from "./api";

export function BillingView({ locale }: { locale: Locale }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void api<MembershipSummary>("/api/v1/customer/membership").then(setSummary).catch((caught) => setError(String(caught.message ?? caught))); }, []);
  return <Page locale={locale} eyebrow={locale === "zh" ? "会员" : "MEMBERSHIP"} title={locale === "zh" ? "方案与账单" : "Plan and billing"} body={locale === "zh" ? "查看权益、周期、续费状态并通过 Stripe 安全管理付款方式。" : "Review entitlements, renewal state and manage payment details securely through Stripe."}>{error ? <ErrorState message={error} /> : summary ? <MembershipPanel locale={locale} membership={summary} /> : <Loading locale={locale} />}</Page>;
}
