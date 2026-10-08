"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatAdminValue } from "@/lib/admin-i18n";

type Locale = "en" | "zh";
export function CustomerAdminActions({ customerId, locale, plan, status, riskCases = [] }: { customerId: string; locale: Locale; plan: string; status: string; riskCases?: Array<{ id: string; action: string; outcome: string; reasonCodes: string[]; appealReason: string | null; status: string }> }) {
  const zh = locale === "zh";
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const ready = !pending && reason.trim().length >= 3;
  async function run(action: string, value?: string) {
    if (["REVOKE_SESSIONS", "SUSPEND_CUSTOMER"].includes(action) && !window.confirm(zh ? "这会终止当前访问，确定执行吗？" : "This will terminate current access. Continue?")) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/customers/${customerId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(value ? { value } : {}), reason }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? (zh ? "操作未完成" : "Action failed"));
      setMessage(zh ? "操作完成并已记录审计。" : "Action completed and audited.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
    finally { setPending(false); }
  }
  return <section className="admin-detail-section"><div className="admin-section-heading"><h2>{zh ? "账号与权益支持" : "Account and entitlement support"}</h2></div><p>{plan} · {formatAdminValue(locale, status)}. {zh ? "权益按已关联支付事实对账；邮箱通过用户验证流程确认。" : "Reconcile entitlement from linked payment facts. Email verification uses the customer verification flow."}</p><label>{zh ? "事件、证据及处置原因" : "Incident, evidence and reason"}<textarea value={reason} minLength={3} maxLength={1000} onChange={event => setReason(event.target.value)} /></label><div className="header-pills">
    <button className="button button-secondary" disabled={!ready} onClick={() => void run("RECONCILE_BILLING")}>{zh ? "核对支付并恢复权益" : "Reconcile billing and entitlement"}</button>
    <button className="button button-secondary" disabled={!ready} onClick={() => void run("REVOKE_SESSIONS")}>{zh ? "撤销全部会话" : "Revoke sessions"}</button>
    <button className="button button-danger" disabled={!ready} onClick={() => void run("SUSPEND_CUSTOMER")}>{zh ? "暂停访问" : "Suspend access"}</button>
    <button className="button button-secondary" disabled={!ready} onClick={() => void run("ACTIVATE_CUSTOMER")}>{zh ? "恢复访问" : "Restore access"}</button>
  </div>{riskCases.filter(item => item.status === "OPEN").map(item => <div className="admin-filter-bar" key={item.id}><span><small>{item.id}</small><br /><strong>{formatAdminValue(locale, item.action)} · {formatAdminValue(locale, item.outcome)}</strong><br />{item.reasonCodes.map(value => formatAdminValue(locale, value)).join(", ")}{item.appealReason ? ` · ${item.appealReason}` : ""}</span><button className="button button-secondary" disabled={!ready} onClick={() => void run("RESOLVE_RISK_ALLOW", item.id)}>{zh ? "审核后放行" : "Allow after review"}</button><button className="button button-danger" disabled={!ready} onClick={() => void run("RESOLVE_RISK_DENY", item.id)}>{zh ? "审核后拒绝" : "Deny after review"}</button></div>)}{message ? <p className="action-message" role="status">{message}</p> : null}</section>;
}
