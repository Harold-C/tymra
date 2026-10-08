"use client";

import { CheckCircle2, CirclePause, Eye, LoaderCircle, RotateCcw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";
import { serviceErrorCopy } from "@/lib/service-operation-copy";

const icons = { ACKNOWLEDGE: Eye, RETRY: RotateCcw, PAUSE_SOURCE: CirclePause, RESOLVE: CheckCircle2, DISMISS: XCircle } as const;
type Action = keyof typeof icons;

export function CollectionIncidentActions({ locale, incidentId, status, severity, canRetry, canPause }: { locale: AdminLocale; incidentId: string; status: string; severity: string; canRetry: boolean; canPause: boolean }) {
  const text = copy(locale);
  const router = useRouter();
  const actions = ([...(status === "OPEN" ? ["ACKNOWLEDGE" as const] : []), ...(canRetry ? ["RETRY" as const] : []), ...(canPause ? ["PAUSE_SOURCE" as const] : []), "RESOLVE" as const, ...(["P2", "P3"].includes(severity) ? ["DISMISS" as const] : [])]);
  const [action, setAction] = useState<Action>(actions[0] ?? "RESOLVE");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const selectedAction = actions.includes(action) ? action : actions[0];
  const Icon = icons[selectedAction];

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (["PAUSE_SOURCE", "DISMISS"].includes(selectedAction) && !window.confirm(text.confirm[selectedAction as "PAUSE_SOURCE" | "DISMISS"])) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/collection-incidents/${incidentId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: selectedAction, reason: form.get("reason") }) });
      const payload = await response.json() as { error?: { code?: string; message?: string } };
      if (!response.ok) throw new Error(serviceErrorCopy(locale, payload.error?.code ?? "") ?? text.failed);
      setMessage(text.completed);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : text.failed); }
    finally { setBusy(false); }
  }

  return <form method="post" data-hydrated={hydrated} className="incident-action-form" onSubmit={submit}><label>{text.action}<select value={selectedAction} onChange={(event) => setAction(event.target.value as Action)}>{actions.map((value) => <option key={value} value={value}>{text.actions[value]}</option>)}</select></label><label>{text.reason}<textarea name="reason" minLength={3} maxLength={1_000} required /></label><button className="button button-secondary" type="submit" disabled={busy || !hydrated}>{busy ? <LoaderCircle className="spin" size={17} /> : <Icon size={17} />}{text.apply}</button>{message ? <p className="action-message" role="status">{message}</p> : null}</form>;
}

function copy(locale: AdminLocale) { return locale === "zh" ? zh : en; }
const en = { action: "Action", reason: "Operational reason", apply: "Apply action", completed: "Action recorded. Recovery closes only after a successful matching run is verified.", failed: "The incident action failed.", actions: { ACKNOWLEDGE: "Acknowledge", RETRY: "Retry safely", PAUSE_SOURCE: "Pause source", RESOLVE: "Verify recovery and close", DISMISS: "Archive historical incident" }, confirm: { PAUSE_SOURCE: "Pause this data source? Scheduled and manual collection will be blocked until it is resumed.", DISMISS: "Archive this incident? Its original evidence and the source health remain unchanged." } };
const zh: typeof en = { action: "处置动作", reason: "处置原因", apply: "应用动作", completed: "动作已记录；验证同范围成功运行后才能关闭异常。", failed: "采集异常操作失败。", actions: { ACKNOWLEDGE: "确认接手", RETRY: "安全重试", PAUSE_SOURCE: "暂停来源", RESOLVE: "验证恢复并关闭", DISMISS: "归档历史异常" }, confirm: { PAUSE_SOURCE: "确定暂停这个数据来源吗？恢复前，定时和手动采集都将被阻止。", DISMISS: "确定归档这个异常吗？原始证据与来源健康保持原状态。" } };
