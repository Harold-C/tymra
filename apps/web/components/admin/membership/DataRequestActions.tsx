"use client";

import { useState } from "react";

export function DataRequestActions({ requestId, locale }: { requestId: string; locale: "en" | "zh" }) {
  const [reason, setReason] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [pending, setPending] = useState(false);
  const run = async (status: "IN_PROGRESS" | "COMPLETED" | "REJECTED") => {
    setPending(true);
    const response = await fetch(`/api/v1/admin/data-requests/${requestId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason, evidenceReference: status === "COMPLETED" ? evidenceReference : undefined }) });
    if (response.ok) window.location.reload(); else setPending(false);
  };
  return <div className="admin-inline-actions"><input aria-label={locale === "zh" ? "处理说明" : "Handling reason"} placeholder={locale === "zh" ? "处理说明" : "Handling reason"} value={reason} onChange={(event) => setReason(event.target.value)} /><input aria-label={locale === "zh" ? "交付或批准凭据" : "Delivery or approval reference"} placeholder={locale === "zh" ? "完成时需要凭据" : "Reference required to complete"} value={evidenceReference} onChange={(event) => setEvidenceReference(event.target.value)} /><button disabled={pending || reason.trim().length < 3} onClick={() => void run("IN_PROGRESS")}>{locale === "zh" ? "处理中" : "Start"}</button><button disabled={pending || reason.trim().length < 3 || evidenceReference.trim().length < 3} onClick={() => void run("COMPLETED")}>{locale === "zh" ? "完成" : "Complete"}</button><button disabled={pending || reason.trim().length < 3} onClick={() => void run("REJECTED")}>{locale === "zh" ? "拒绝" : "Reject"}</button></div>;
}
