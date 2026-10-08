"use client";

import { LoaderCircle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import type { AdminLocale } from "@/lib/admin-i18n";
import { serviceErrorCopy } from "@/lib/service-operation-copy";

export function ServiceRecoveryAction({ locale, endpoint, label, action = "RETRY", completedMessage, confirmation }: { locale: AdminLocale; endpoint: string; label?: string; action?: "RETRY" | "REVOKE" | "RECONCILE" | "CANCEL"; completedMessage?: string; confirmation?: string }) {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [auditEventId, setAuditEventId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (confirmation && !window.confirm(confirmation)) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setMessage("");
    setAuditEventId("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason: form.get("reason") }) });
      const result = await response.json() as { error?: { code?: string }; data?: { auditEventId?: string } };
      if (!response.ok) throw new Error(serviceErrorCopy(locale, result.error?.code));
      setMessage(completedMessage ?? (locale === "zh" ? "恢复任务已提交，请检查执行结果。" : "Recovery queued. Check its actual outcome."));
      setAuditEventId(result.data?.auditEventId ?? "");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : serviceErrorCopy(locale, undefined)); }
    finally { setBusy(false); }
  }
  return <form method="post" data-hydrated={hydrated} className="incident-action-form" onSubmit={submit}><label>{locale === "zh" ? "恢复原因" : "Recovery reason"}<textarea name="reason" minLength={3} maxLength={1_000} required /></label><button className="button button-secondary" disabled={busy || !hydrated}>{busy ? <LoaderCircle size={16} className="spin" /> : <RotateCcw size={16} />}{label ?? (locale === "zh" ? "恢复失败任务" : "Recover failed task")}</button>{message ? <p className="action-message" role="status">{message}</p> : null}{auditEventId ? <Link href={`/admin/audit?q=${encodeURIComponent(auditEventId)}`}>{locale === "zh" ? "审计事件" : "Audit event"} · {auditEventId}</Link> : null}</form>;
}
