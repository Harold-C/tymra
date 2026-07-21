"use client";

import { LoaderCircle, Play, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { adminText, formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";

export function ExceptionActions({ locale, exceptionId, actions }: { locale: AdminLocale; exceptionId: string; actions: string[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>, action: string) {
    event.preventDefault();
    setBusy(action);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = {};
    for (const key of ["propertyId", "unitId", "relationshipId", "observationId", "role"]) {
      const value = form.get(key);
      if (typeof value === "string" && value) payload[key] = value;
    }
    const normalized = form.get("effectiveNightlyTotalMinor");
    if (typeof normalized === "string" && normalized) payload.effectiveNightlyTotalMinor = Number(normalized);
    const response = await fetch(`/api/v1/admin/exceptions/${exceptionId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, reason: form.get("reason"), payload }) });
    if (response.ok) {
      setMessage(`${formatAdminValue(locale, action)} ${adminText(locale, "actionCompleted")}`);
      router.refresh();
    } else {
      setMessage(adminText(locale, "actionFailed"));
    }
    setBusy(null);
  }

  if (!actions.length) return <div className="admin-empty compact"><h2>{adminText(locale, "noActions")}</h2><p>{adminText(locale, "noActionsBody")}</p></div>;
  return <div className="exception-actions"><div className="action-grid">{actions.map((action) => <form key={action} onSubmit={(event) => submit(event, action)}><div className="action-title"><ShieldCheck size={17} /><strong>{formatAdminValue(locale, action)}</strong></div><ActionFields locale={locale} action={action} /><label>{adminText(locale, "resolutionReason")}<textarea name="reason" minLength={3} maxLength={1_000} defaultValue={adminText(locale, "reviewedEvidence")} required /></label><button className="button button-secondary" type="submit" disabled={busy !== null}>{busy === action ? <LoaderCircle className="spin" size={17} /> : <Play size={17} />}{adminText(locale, "applyAction")}</button></form>)}</div>{message ? <p className="action-message" role="status">{message}</p> : null}</div>;
}

function ActionFields({ locale, action }: { locale: AdminLocale; action: string }) {
  if (action === "SELECT_PROPERTY") return <label>{adminText(locale, "propertyId")}<input name="propertyId" required /></label>;
  if (action === "SELECT_UNIT") return <label>{adminText(locale, "unitId")}<input name="unitId" required /></label>;
  if (action === "EXCLUDE_COMPETITOR") return <label>{adminText(locale, "relationshipId")}<input name="relationshipId" required /></label>;
  if (action === "CHANGE_COMPETITOR_ROLE") return <><label>{adminText(locale, "relationshipId")}<input name="relationshipId" required /></label><label>{adminText(locale, "newRole")}<select name="role"><option value="CORE">{formatAdminValue(locale, "CORE")}</option><option value="REFERENCE">{formatAdminValue(locale, "REFERENCE")}</option><option value="EXCLUDED">{formatAdminValue(locale, "EXCLUDED")}</option></select></label></>;
  if (action === "EDIT_NORMALIZED_VALUE") return <><label>{adminText(locale, "observationId")}<input name="observationId" required /></label><label>{adminText(locale, "effectiveNightlyTotal")}<input name="effectiveNightlyTotalMinor" type="number" min="1" required /></label></>;
  return null;
}
