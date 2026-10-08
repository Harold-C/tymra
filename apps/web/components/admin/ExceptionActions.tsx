"use client";

import type { ServiceExceptionAction } from "@tymra/domain";
import { LoaderCircle, Play, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";
import { serviceActionCopy, serviceErrorCopy } from "@/lib/service-operation-copy";

export function ExceptionActions({ locale, exceptionId, actions }: { locale: AdminLocale; exceptionId: string; actions: ServiceExceptionAction[] }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, action: ServiceExceptionAction) {
    event.preventDefault();
    if (["WITHDRAW_RESULT", "DISMISS"].includes(action) && !window.confirm(serviceActionCopy(locale, action).detail)) return;
    const form = new FormData(event.currentTarget);
    setBusy(action);
    setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/exceptions/${exceptionId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason: form.get("reason") }) });
      const payload = await response.json() as { error?: { code?: string }; data?: { status?: string } };
      if (!response.ok) throw new Error(serviceErrorCopy(locale, payload.error?.code));
      setMessage(payload.data?.status === "RESOLVED" ? (locale === "zh" ? "已验证恢复并关闭事件。" : "Recovery verified; event closed.") : (locale === "zh" ? "处理记录已保存，请继续检查实际结果。" : "Action recorded. Inspect the actual outcome before closing."));
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : serviceErrorCopy(locale, undefined)); }
    finally { setBusy(null); }
  }

  if (!actions.length) return <div className="admin-empty compact"><h2>{adminText(locale, "noActions")}</h2><p>{adminText(locale, "noActionsBody")}</p></div>;
  return <div className="exception-actions"><div className="action-grid">{actions.map((action) => {
    const text = serviceActionCopy(locale, action);
    return <form method="post" data-hydrated={hydrated} key={action} onSubmit={(event) => submit(event, action)}><div className="action-title"><ShieldCheck size={17} /><strong>{text.title}</strong></div><p>{text.detail}</p><label>{adminText(locale, "resolutionReason")}<textarea name="reason" minLength={3} maxLength={1_000} required /></label><button className="button button-secondary" type="submit" disabled={busy !== null || !hydrated}>{busy === action ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}{text.title}</button></form>;
  })}</div>{message ? <p className="action-message" role="status">{message}</p> : null}</div>;
}
