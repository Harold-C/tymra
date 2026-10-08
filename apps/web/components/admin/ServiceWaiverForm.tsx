"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminLocale } from "@/lib/admin-i18n";
import { serviceErrorCopy } from "@/lib/service-operation-copy";

export function ServiceWaiverForm({ schedules, locale }: { schedules: { key: string }[]; locale: AdminLocale }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      const expiresAt = new Date(String(form.get("expiresAt"))).toISOString();
      const response = await fetch("/api/v1/admin/waivers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scheduleKey: form.get("scheduleKey"), reason: form.get("reason"), expiresAt }) });
      const result = await response.json(); if (!response.ok) throw new Error(serviceErrorCopy(locale, result.error?.code));
      setMessage(locale === "zh" ? "豁免已保存，到期后自动恢复原计划规则。" : "Waiver saved. The original policy resumes at expiry."); router.refresh();
    } catch(error) { setMessage(error instanceof Error ? error.message : serviceErrorCopy(locale)); } finally { setBusy(false); }
  }
  return <form method="post" data-hydrated={hydrated} onSubmit={submit} className="incident-action-form"><label>{locale === "zh" ? "单个计划" : "Single schedule"}<select name="scheduleKey" required>{schedules.map(s => <option key={s.key}>{s.key}</option>)}</select></label><label>{locale === "zh" ? "到期时间（本机时区，最长 24 小时）" : "Expiry (device timezone, at most 24 hours)"}<input name="expiresAt" type="datetime-local" required /></label><label>{locale === "zh" ? "豁免原因" : "Waiver reason"}<textarea name="reason" minLength={3} maxLength={1000} required /></label><button className="button button-secondary" disabled={busy || !hydrated || !schedules.length}>{locale === "zh" ? "保存临时豁免" : "Save temporary waiver"}</button><p role="status">{message}</p></form>;
}
