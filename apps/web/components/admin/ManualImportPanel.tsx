"use client";

import { FileCheck2, Upload } from "lucide-react";
import { useState } from "react";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";

type ImportError = { row: number; fields: Record<string, string[]> };
type Preview = { totalRows: number; validRowCount: number; errors: ImportError[] };
type ImportResult = Preview & { id: string; status: string; errorRowCount: number; collectionRunId: string | null };

export function ManualImportPanel({ locale }: { locale: AdminLocale }) {
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function chooseFile(selected: File | null) {
    setFile(selected);
    setPreview(null);
    setResult(null);
    setError("");
    if (!selected) {
      setContent("");
      return;
    }
    setFormat(selected.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setContent(await selected.text());
  }

  async function submit(mode: "preview" | "import") {
    if (!file || !content) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/admin/manual-imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ filename: file.name, format, content, mode }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(adminText(locale, "importFailed"));
      if (mode === "preview") {
        setPreview(payload.data);
        setResult(null);
      } else {
        setResult(payload.data);
        setPreview(null);
      }
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : adminText(locale, "importFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="manual-import-section" aria-labelledby="manual-import-title">
      <header className="admin-page-header">
        <div>
          <h2 id="manual-import-title">{adminText(locale, "manualImport")}</h2>
          <p>{adminText(locale, "manualImportDescription")}</p>
        </div>
        <a className="admin-secondary-action" href="/manual-import-template.csv" download>{adminText(locale, "downloadTemplate")}</a>
      </header>

      <div className="manual-import-controls">
        <label className="admin-file-field">
          <span>{adminText(locale, "importFile")}</span>
          <input type="file" accept=".csv,.json,text/csv,application/json" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} />
        </label>
        <label className="admin-select-field">
          <span>{adminText(locale, "format")}</span>
          <select value={format} onChange={(event) => { setFormat(event.target.value as "csv" | "json"); setPreview(null); }}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <button className="admin-secondary-action" type="button" disabled={!file || busy} onClick={() => void submit("preview")}>
          <FileCheck2 size={16} aria-hidden="true" /> {adminText(locale, busy ? "working" : "preview")}
        </button>
      </div>

      {file ? <p className="admin-file-meta">{file.name} · {(file.size / 1024).toFixed(1)} KB</p> : null}
      {error ? <p className="admin-form-error" role="alert">{error}</p> : null}

      {preview ? (
        <div className="manual-import-preview">
          <div className="import-counts" aria-label={adminText(locale, "importSummary")}>
            <span><strong>{preview.totalRows}</strong> {adminText(locale, "rows")}</span>
            <span><strong>{preview.validRowCount}</strong> {adminText(locale, "valid")}</span>
            <span><strong>{preview.errors.length}</strong> {adminText(locale, "invalid")}</span>
          </div>
          {preview.errors.length > 0 ? <ImportErrors locale={locale} errors={preview.errors} /> : <p className="admin-form-success">{adminText(locale, "allRowsValid")}</p>}
          <button className="admin-primary-action" type="button" disabled={busy || preview.validRowCount === 0} onClick={() => void submit("import")}>
            <Upload size={16} aria-hidden="true" /> {adminText(locale, "importAction")} {preview.validRowCount} {adminText(locale, "validRows")}
          </button>
        </div>
      ) : null}

      {result ? (
        <div className="admin-form-success" role="status">
          {adminText(locale, "importAction")} {result.status.toLowerCase()}: {result.validRowCount} {adminText(locale, "validRows")}, {result.errorRowCount} {adminText(locale, "rejectedRows")}.
        </div>
      ) : null}
    </section>
  );
}

function ImportErrors({ locale, errors }: { locale: AdminLocale; errors: ImportError[] }) {
  return (
    <div className="import-errors">
      <h3>{adminText(locale, "validationErrors")}</h3>
      <ul>
        {errors.slice(0, 50).map((item) => (
          <li key={item.row}>
            <strong>{adminText(locale, "row")} {item.row}:</strong>{" "}
            {Object.entries(item.fields).map(([field, messages]) => `${field} ${messages.join(", ")}`).join("; ")}
          </li>
        ))}
      </ul>
      {errors.length > 50 ? <p>{adminText(locale, "showingErrors")}</p> : null}
    </div>
  );
}
