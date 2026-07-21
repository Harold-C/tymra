"use client";

import { Link2, LoaderCircle } from "lucide-react";
import { useState } from "react";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";

export function ReissueResultLinkButton({ locale, checkId, enabled }: { locale: AdminLocale; checkId: string; enabled: boolean }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function reissue() {
    setState("sending");
    const response = await fetch(`/api/v1/admin/checks/${checkId}/reissue-link`, { method: "POST" });
    setState(response.ok ? "sent" : "error");
  }

  return (
    <div className="inline-admin-action">
      <button className="admin-secondary-action" type="button" disabled={!enabled || state === "sending"} onClick={() => void reissue()}>
        {state === "sending" ? <LoaderCircle className="spin" size={16} /> : <Link2 size={16} />}
        {adminText(locale, "reissueLink")}
      </button>
      {state === "sent" ? <span role="status">{adminText(locale, "reissueQueued")}</span> : null}
      {state === "error" ? <span role="alert">{adminText(locale, "reissueFailed")}</span> : null}
    </div>
  );
}
