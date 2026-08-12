"use client";

import { ExternalLink, LoaderCircle, ShieldCheck } from "lucide-react";
import { useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";
import type { ArgusManualActionView } from "@/lib/server/argus-manual-actions";

export function ArgusManualActionsPanel({ actions, locale }: { actions: ArgusManualActionView[]; locale: AdminLocale }) {
  const text = locale === "zh" ? zh : en;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function openHandoff(executionId: string) {
    const popup = window.open("about:blank", "_blank", "noopener,noreferrer");
    setBusy(executionId);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/argus-manual-actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ executionId }),
      });
      const payload = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !payload.data?.url) throw new Error(payload.error?.message ?? text.failed);
      if (popup) popup.location.replace(payload.data.url);
      else window.location.assign(payload.data.url);
    } catch (caught) {
      popup?.close();
      setError(caught instanceof Error ? caught.message : text.failed);
    } finally {
      setBusy("");
    }
  }

  return <section className="admin-page">
    <header className="admin-page-header"><div><h1>{text.title}</h1><p>{text.description}</p></div></header>
    {error ? <p className="collection-notice error" role="alert">{error}</p> : null}
    {actions.length ? <div className="admin-table-wrap" tabIndex={0}><table className="admin-table"><thead><tr><th>{text.connector}</th><th>{text.reason}</th><th>{text.job}</th><th>{text.expires}</th><th>{text.action}</th></tr></thead><tbody>{actions.map((action) => <tr key={action.executionId}>
      <td><strong>{action.connectorId}</strong><code>{action.workflowId}</code></td>
      <td><span className="status-pill pill-waiting-for-manual">{action.reason}</span></td>
      <td><code>{action.argusJobId}</code><span className="table-secondary">{action.sourceHost}</span></td>
      <td>{new Date(action.expiresAt).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", { timeZone: "Pacific/Auckland", dateStyle: "medium", timeStyle: "short" })}</td>
      <td><button className="button button-primary" type="button" disabled={busy !== ""} onClick={() => void openHandoff(action.executionId)}>{busy === action.executionId ? <LoaderCircle className="spin" size={16} /> : <ExternalLink size={16} />}{text.open}</button></td>
    </tr>)}</tbody></table></div> : <div className="admin-empty"><ShieldCheck size={28} /><h2>{text.empty}</h2><p>{text.emptyBody}</p></div>}
  </section>;
}

const en = { title: "Argus manual browser actions", description: "Issue a short-lived noVNC link only for an active same-session CAPTCHA or verification handoff.", connector: "Connector", reason: "Challenge", job: "Argus job", expires: "Expires", action: "Action", open: "Open secure handoff", failed: "The handoff could not be issued.", empty: "No manual action required", emptyBody: "Active Argus jobs will appear here only while their retained browser session is valid." };
const zh: typeof en = { title: "Argus 人工浏览器接管", description: "仅为仍有效的同会话 CAPTCHA 或验证任务签发短期 noVNC 链接。", connector: "Connector", reason: "验证类型", job: "Argus Job", expires: "到期时间", action: "操作", open: "打开安全接管", failed: "无法签发接管链接。", empty: "当前无需人工处理", emptyBody: "只有保留的浏览器会话仍有效时，Argus 任务才会显示在这里。" };
