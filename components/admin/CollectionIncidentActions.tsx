"use client";

import { CheckCircle2, CirclePause, Eye, LoaderCircle, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";

const icons = { ACKNOWLEDGE: Eye, RETRY: RotateCcw, PAUSE_SOURCE: CirclePause, RESOLVE: CheckCircle2, DISMISS: XCircle } as const;
type Action = keyof typeof icons;

export function CollectionIncidentActions({ locale, incidentId, status, canRetry, canPause }: { locale: AdminLocale; incidentId: string; status: string; canRetry: boolean; canPause: boolean }) {
  const text = copy(locale);
  const router = useRouter();
  const actions = ([...(status === "OPEN" ? ["ACKNOWLEDGE" as const] : []), ...(canRetry ? ["RETRY" as const] : []), ...(canPause ? ["PAUSE_SOURCE" as const] : []), "RESOLVE" as const, "DISMISS" as const]);
  const [action, setAction] = useState<Action>(actions[0] ?? "RESOLVE");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const Icon = icons[action];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (["PAUSE_SOURCE", "DISMISS"].includes(action) && !window.confirm(text.confirm[action as "PAUSE_SOURCE" | "DISMISS"])) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/collection-incidents/${incidentId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason: form.get("reason") }) });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? text.failed);
      setMessage(text.completed);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : text.failed); }
    finally { setBusy(false); }
  }

  return <form className="incident-action-form" onSubmit={submit}><label>{text.action}<select value={action} onChange={(event) => setAction(event.target.value as Action)}>{actions.map((value) => <option key={value} value={value}>{text.actions[value]}</option>)}</select></label><label>{text.reason}<textarea name="reason" minLength={3} maxLength={1_000} defaultValue={text.defaultReason} required /></label><button className="button button-secondary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Icon size={17} />}{text.apply}</button>{message ? <p className="action-message" role="status">{message}</p> : null}</form>;
}

function copy(locale: AdminLocale) { return locale === "zh" ? zh : en; }
const en = { action: "Action", reason: "Operational reason", defaultReason: "Reviewed the collection evidence and run diagnostics.", apply: "Apply action", completed: "Incident updated.", failed: "The incident action failed.", actions: { ACKNOWLEDGE: "Acknowledge", RETRY: "Retry safely", PAUSE_SOURCE: "Pause source", RESOLVE: "Mark resolved", DISMISS: "Dismiss" }, confirm: { PAUSE_SOURCE: "Pause this data source? Scheduled and manual collection will be blocked until it is resumed.", DISMISS: "Dismiss this incident without a corrective action?" } };
const zh: typeof en = { action: "处置动作", reason: "运营原因", defaultReason: "已检查采集证据和运行诊断。", apply: "应用动作", completed: "采集异常已更新。", failed: "采集异常操作失败。", actions: { ACKNOWLEDGE: "确认接手", RETRY: "安全重试", PAUSE_SOURCE: "暂停来源", RESOLVE: "标记已解决", DISMISS: "忽略异常" }, confirm: { PAUSE_SOURCE: "确定暂停这个数据来源吗？恢复前，定时和手动采集都将被阻止。", DISMISS: "确定在不执行修复动作的情况下忽略这个异常吗？" } };
