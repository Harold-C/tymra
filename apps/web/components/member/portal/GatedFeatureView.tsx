"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { type MembershipPlan, type MembershipSummary } from "../contracts";
import { Page, Loading } from "./shared";
import type { Locale } from "../contracts";
import { api } from "./api";

export const planOrder: Record<MembershipPlan, number> = { FREE: 0, HOST: 1, PRO: 2, PORTFOLIO: 3 };

export function GatedFeatureView({ locale, feature, minimumPlan }: { locale: Locale; feature: "alerts" | "portfolio" | "exports" | "integrations"; minimumPlan: MembershipPlan }) {
  const [summary, setSummary] = useState<MembershipSummary | null>(null);
  useEffect(() => { void api<MembershipSummary>("/api/v1/customer/membership").then(setSummary); }, []);
  const names = { alerts: locale === "zh" ? "价格提醒" : "Price alerts", portfolio: locale === "zh" ? "组合管理" : "Portfolio", exports: locale === "zh" ? "数据导出" : "Data exports", integrations: locale === "zh" ? "系统集成" : "Integrations" };
  const entitled = summary ? planOrder[summary.plan] >= planOrder[minimumPlan] : false;
  const launched = summary?.featureAvailability[feature] ?? false;
  return <Page locale={locale} eyebrow={locale === "zh" ? "方案功能" : "PLAN FEATURE"} title={names[feature]} body={locale === "zh" ? "功能可用性取决于你的会员方案和当前开放范围。" : "Availability depends on your membership plan and the current product rollout."}>{!summary ? <Loading locale={locale} /> : <div className="feature-gate"><ShieldCheck aria-hidden="true" /><h2>{!entitled ? locale === "zh" ? `需要 ${minimumPlan} 或更高方案` : `${minimumPlan} or higher required` : !launched ? locale === "zh" ? "即将开放" : "Coming soon" : locale === "zh" ? "功能可用" : "Feature available"}</h2><p>{locale === "zh" ? "已有价格检查和报告不受影响；功能开放后会在此处显示。" : "Existing Price Checks and reports are unaffected. This page will update when the feature becomes available."}</p>{!entitled ? <Link className="button button-primary" href={`/${locale}/account/billing`}>{locale === "zh" ? "查看方案" : "Compare plans"}</Link> : null}</div>}</Page>;
}
