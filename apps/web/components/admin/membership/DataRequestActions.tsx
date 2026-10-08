"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export function DataRequestActions({ requestId, locale, requestType, ready = false }: { requestId: string; locale: "en" | "zh"; requestType: string; ready?: boolean }) {
  const zh = locale === "zh"; const router = useRouter();
  const [reason, setReason] = useState(""); const [evidenceReference, setEvidenceReference] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  async function run(status: "IN_PROGRESS" | "COMPLETED" | "REJECTED") {
    if (status === "COMPLETED" && requestType === "DELETE" && !window.confirm(zh ? "执行该用户已申请的删除？身份将去标识，访问与服务将停用。" : "Execute this user's deletion request? Identity will be removed and access and service disabled.")) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/v1/admin/data-requests/${requestId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason, ...(evidenceReference ? { evidenceReference } : {}) }) });
      const result = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? (zh ? "处理未完成" : "Action failed"));
      setMessage(zh ? "执行结果已记录。" : "Execution recorded."); router.refresh();
    } catch(error) { setMessage(error instanceof Error ? error.message : "Action failed"); } finally { setPending(false); }
  }
  return <div className="incident-action-form" data-hydrated={hydrated}><label>{zh ? "核验事实及处置原因" : "Verified facts and reason"}<textarea disabled={pending || !hydrated} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} /></label>{requestType === "DELETE" ? <label>{zh ? "用户申请与核验凭据" : "Customer request and verification reference"}<input disabled={pending || !hydrated} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} /></label> : null}<div className="header-pills"><button className="button button-secondary" disabled={pending || !hydrated || reason.trim().length < 3} onClick={() => void run("IN_PROGRESS")}>{zh ? "接手处理" : "Take ownership"}</button><button className="button button-secondary" disabled={pending || !hydrated || reason.trim().length < 3 || ready || (requestType === "DELETE" && evidenceReference.trim().length < 3)} onClick={() => void run("COMPLETED")}>{requestType === "EXPORT" ? zh ? "生成可下载文件" : "Prepare downloadable export" : zh ? "执行删除" : "Execute deletion"}</button><button className="button button-secondary" disabled={pending || !hydrated || reason.trim().length < 3 || ready} onClick={() => void run("REJECTED")}>{zh ? "拒绝并记录原因" : "Reject with reason"}</button></div>{message ? <p role="status">{message}</p> : null}</div>;
}
