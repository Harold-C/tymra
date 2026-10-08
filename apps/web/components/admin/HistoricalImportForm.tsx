"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AdminLocale } from "@/lib/admin-i18n";
import { serviceErrorCopy } from "@/lib/service-operation-copy";
type Preview = { totalRows: number; validRows: number; errors: { rowNumber: number; errorCode: string }[]; checksum: string };
export function HistoricalImportForm({ sources, locale }: { sources: { key: string; name: string; domains: string[] }[]; locale: AdminLocale }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [preview, setPreview] = useState<Preview | null>(null); const [prepared, setPrepared] = useState<unknown>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const form = new FormData(event.currentTarget); const file = form.get("file"); if (!(file instanceof File) || file.size > 5_000_000) throw new Error(locale === "zh" ? "选择不超过 5 MB 的 JSON 文件。" : "Choose a JSON file up to 5 MB.");
      const records = JSON.parse(await file.text());
      const input = { commandId: crypto.randomUUID(), sourceKey: form.get("sourceKey"), reason: form.get("reason"), evidenceReference: form.get("evidenceReference"), rangeFrom: new Date(`${form.get("from")}T00:00:00Z`).toISOString(), rangeTo: new Date(`${form.get("to")}T23:59:59Z`).toISOString(), records };
      const response = await fetch("/api/v1/admin/backfills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PREVIEW", input }) }); const result = await response.json(); if (!response.ok) throw new Error(serviceErrorCopy(locale, result.error?.code));
      setPreview(result.data); setPrepared(input);
    } catch(error) { setPreview(null); setPrepared(null); setMessage(error instanceof Error ? error.message : serviceErrorCopy(locale)); } finally { setBusy(false); }
  }
  async function commit() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/v1/admin/backfills", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "IMPORT", input: prepared }) }); const result = await response.json(); if (!response.ok) throw new Error(serviceErrorCopy(locale, result.error?.code)); router.push(`/admin/backfills/${result.data.id}`); }
    catch(error) { setMessage(error instanceof Error ? error.message : serviceErrorCopy(locale)); } finally { setBusy(false); }
  }
  return <><form method="post" data-hydrated={hydrated} className="incident-action-form" onSubmit={submit} onChange={() => { setPreview(null); setPrepared(null); }}><label>{locale === "zh" ? "官方公共来源" : "Official public source"}<select name="sourceKey" required>{sources.map(s => <option key={s.key} value={s.key}>{s.name} · {s.domains.join(", ")}</option>)}</select></label><label>{locale === "zh" ? "原始来源证据 URL" : "Original source evidence URL"}<input type="url" name="evidenceReference" required /></label><label>{locale === "zh" ? "历史范围开始（UTC）" : "Historical range start (UTC)"}<input type="date" name="from" required /></label><label>{locale === "zh" ? "历史范围结束（UTC）" : "Historical range end (UTC)"}<input type="date" name="to" required /></label><label>{locale === "zh" ? "事实文件（JSON，最多 5000 行）" : "Fact file (JSON, at most 5000 rows)"}<input type="file" name="file" accept=".json,application/json" required /></label><label>{locale === "zh" ? "范围、使用依据与回填原因" : "Scope, permitted use and reason"}<textarea name="reason" minLength={3} maxLength={1000} required /></label><button disabled={busy || !hydrated} className="button button-secondary">{locale === "zh" ? "校验并预览影响" : "Validate and preview"}</button></form>{preview ? <section className="admin-detail-section"><p>{locale === "zh" ? "预览" : "Preview"}: {preview.validRows} / {preview.totalRows} · SHA-256: {preview.checksum}</p><p>{locale === "zh" ? "有效记录追加到历史事实库并按来源、时间和内容去重。不会刷新当前来源时效或覆盖已发布结果。" : "Valid rows append to historical facts with source/time/content deduplication. Current freshness and published results remain unchanged."}</p>{preview.errors.map(row => <p key={row.rowNumber}>#{row.rowNumber}: {row.errorCode}</p>)}<button disabled={busy || !preview.validRows} onClick={commit} className="button button-primary">{locale === "zh" ? "按此预览提交回填" : "Import this reviewed scope"}</button></section> : null}<p role="status">{message}</p></>;
}
