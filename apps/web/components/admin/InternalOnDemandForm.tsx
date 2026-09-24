"use client";

import { useState } from "react";

type Result = { checkId: string; analysisType: string; status: string; targetKind: string };

export function InternalOnDemandForm({ defaults, enabled }: { defaults: { checkIn: string; checkOut: string }; enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true); setError(null); setResult(null);
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/on-demand", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ target: form.get("target"), checkIn: form.get("checkIn"), checkOut: form.get("checkOut"), adults: Number(form.get("adults")), units: Number(form.get("units")) }),
    });
    const payload = await response.json().catch(() => null) as { data?: Result; error?: { message?: string } } | null;
    if (!response.ok || !payload?.data) setError(payload?.error?.message ?? "The on-demand request could not be created.");
    else setResult(payload.data);
    setPending(false);
  }

  return <section className="admin-panel">
    <div className="admin-section-heading"><div><p className="eyebrow">Bounded operator workflow</p><h2>Collect a New Zealand target</h2></div></div>
    <p>Enter one supported OTA listing URL or one complete New Zealand address. Each request is limited to 30 nights, 365 days ahead, four rooms and 16 adults; source capability and health gates still apply.</p>
    <form className="admin-form-stack" onSubmit={submit}>
      <label>Address or OTA listing URL<input name="target" required minLength={3} maxLength={500} placeholder="251a Memorial Avenue, Christchurch or https://…" disabled={!enabled || pending} /></label>
      <div className="admin-form-grid">
        <label>Check-in<input name="checkIn" type="date" defaultValue={defaults.checkIn} required disabled={!enabled || pending} /></label>
        <label>Check-out<input name="checkOut" type="date" defaultValue={defaults.checkOut} required disabled={!enabled || pending} /></label>
        <label>Adults<input name="adults" type="number" defaultValue={2} min={1} max={16} required disabled={!enabled || pending} /></label>
        <label>Rooms<input name="units" type="number" defaultValue={1} min={1} max={4} required disabled={!enabled || pending} /></label>
      </div>
      <button className="button button-primary" type="submit" disabled={!enabled || pending}>{pending ? "Creating…" : "Start bounded collection"}</button>
    </form>
    {!enabled ? <p className="status-callout is-warning">Internal on-demand collection is paused by runtime configuration.</p> : null}
    {error ? <p className="status-callout is-error" role="alert">{error}</p> : null}
    {result ? <div className="status-callout is-success" role="status"><strong>Request accepted</strong><p>{result.targetKind} · {result.analysisType} · {result.status}</p><a href={`/admin/checks/${result.checkId}`}>Open Price Check {result.checkId}</a></div> : null}
  </section>;
}
