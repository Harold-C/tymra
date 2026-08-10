"use client";

import { useState } from "react";

type Locale = "en" | "zh";

export function CustomerAdminActions({ customerId, locale, plan, status, riskCases = [] }: { customerId: string; locale: Locale; plan: string; status: string; riskCases?: Array<{ id: string; action: string; outcome: string; reasonCodes: string[]; appealReason: string | null; status: string }> }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const run = async (action: string, value?: string) => {
    setPending(true); setMessage(null);
    const response = await fetch(`/api/v1/admin/customers/${customerId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, value, reason }) });
    const payload = await response.json() as { error?: { message?: string } };
    if (!response.ok) { setMessage(payload.error?.message ?? "Action failed"); setPending(false); return; }
    window.location.reload();
  };
  return <section className="admin-detail-section"><div className="admin-section-heading"><div><span>{locale === "zh" ? "受审计操作" : "AUDITED ACTIONS"}</span><h2>{locale === "zh" ? "会员与风控管理" : "Membership and risk controls"}</h2></div></div><div className="admin-filter-bar"><label><span>{locale === "zh" ? "操作原因（必填）" : "Reason (required)"}</span><input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} /></label><label><span>{locale === "zh" ? "方案" : "Plan"}</span><select defaultValue={plan} onChange={(event) => void run("SET_PLAN", event.target.value)} disabled={pending || reason.trim().length < 3}>{["FREE", "HOST", "PRO", "PORTFOLIO"].map((value) => <option key={value}>{value}</option>)}</select></label><label><span>{locale === "zh" ? "状态" : "Status"}</span><select defaultValue={status} onChange={(event) => void run("SET_MEMBERSHIP_STATUS", event.target.value)} disabled={pending || reason.trim().length < 3}>{["ACTIVE", "PAST_DUE", "CANCELLED", "INCOMPLETE", "PAUSED"].map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button-secondary" disabled={pending || reason.trim().length < 3} onClick={() => void run("MARK_EMAIL_VERIFIED")}>{locale === "zh" ? "标记邮箱已验证" : "Mark email verified"}</button><button className="button button-secondary" disabled={pending || reason.trim().length < 3} onClick={() => void run("RELEASE_BENEFIT_GROUP")}>{locale === "zh" ? "解除权益组关联" : "Release benefit group"}</button><button className="button button-secondary" disabled={pending || reason.trim().length < 3} onClick={() => void run("REVOKE_SESSIONS")}>{locale === "zh" ? "撤销全部会话" : "Revoke all sessions"}</button></div>{riskCases.filter((item) => item.status === "OPEN").map((item) => <div className="admin-filter-bar" key={item.id}><span><strong>{item.action} · {item.outcome}</strong><br />{item.reasonCodes.join(", ")}{item.appealReason ? ` · Appeal: ${item.appealReason}` : ""}</span><button className="button button-secondary" disabled={pending || reason.trim().length < 3} onClick={() => void run("RESOLVE_RISK_ALLOW", item.id)}>{locale === "zh" ? "允许" : "Allow"}</button><button className="button button-secondary" disabled={pending || reason.trim().length < 3} onClick={() => void run("RESOLVE_RISK_DENY", item.id)}>{locale === "zh" ? "拒绝" : "Deny"}</button></div>)}{message ? <p className="admin-form-error">{message}</p> : null}</section>;
}
