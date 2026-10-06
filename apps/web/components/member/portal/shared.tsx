"use client";

import { AlertTriangle, LoaderCircle } from "lucide-react";
import type { Locale } from "../contracts";

export function Page({ locale, eyebrow, title, body, children }: { locale: Locale; eyebrow: string; title: string; body: string; children: React.ReactNode }) {
  return <section className="member-page"><div className="rough-shell"><span className="rough-eyebrow">{eyebrow}</span><h1>{title}</h1><p className="member-page-intro">{body}</p>{children}</div></section>;
}

export function Loading({ locale }: { locale: Locale }) {
  return <div className="loading-state"><LoaderCircle className="spin" aria-hidden="true" /><span>{locale === "zh" ? "正在加载会员数据" : "Loading member data"}</span></div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="flow-notice notice-danger"><AlertTriangle aria-hidden="true" /><div><strong>Unable to load</strong><p>{message}</p></div></div>;
}
