"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminLocale } from "@/lib/admin-i18n";
import { serviceErrorCopy } from "@/lib/service-operation-copy";

export function UsageCorrectionForm({ customerId, locale }: { customerId: string; locale: AdminLocale }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/customers/${customerId}/usage-corrections`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(Object.fromEntries(form)) });
      const result = await response.json(); if (!response.ok) throw new Error(serviceErrorCopy(locale, result.error?.code));
      setMessage(locale === "zh" ? "重复记录已纠正，原始扣额历史保留。" : "Duplicate corrected; original usage history retained."); router.refresh();
    } catch(error) { setMessage(error instanceof Error ? error.message : serviceErrorCopy(locale)); } finally { setBusy(false); }
  }
  return <form method="post" data-hydrated={hydrated} onSubmit={submit} className="incident-action-form"><p>{locale === "zh" ? "只纠正同一客户、请求、权益组和用量类型的重复扣额。" : "Correction requires matching customer, request, benefit group and usage type."}</p><label>{locale === "zh" ? "重复记录 ID" : "Duplicate usage ID"}<input name="usageId" required /></label><label>{locale === "zh" ? "保留的原记录 ID" : "Original usage ID to retain"}<input name="originalUsageId" required /></label><label>{locale === "zh" ? "证据引用" : "Evidence reference"}<input name="evidenceReference" minLength={3} required /></label><label>{locale === "zh" ? "纠正原因" : "Correction reason"}<textarea name="reason" minLength={3} required maxLength={1000} /></label><button className="button button-secondary" disabled={busy || !hydrated}>{locale === "zh" ? "核实并纠正" : "Verify and correct"}</button><p role="status">{message}</p></form>;
}
