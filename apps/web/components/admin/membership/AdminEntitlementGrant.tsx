"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Grant = { plan: string; capacity: number; expiresOn: string | null; active: boolean } | null;
type Request = { action: "GRANT" | "REVOKE"; plan?: string; capacity?: number; expiresOn?: string | null; retainedUnitIds: string[]; reason: string; expectedVersion: number; idempotencyKey: string };

export function AdminEntitlementGrant({ customerId, locale, currentPlan, version, grant, capacityLimit, grantAllowed, occupiedUnits }: {
  customerId: string; locale: "en" | "zh"; currentPlan: string; version: number; grant: Grant; capacityLimit: number; grantAllowed: boolean;
  occupiedUnits: Array<{ id: string; name: string }>;
}) {
  const zh = locale === "zh";
  const router = useRouter();
  const [plan, setPlan] = useState(grant?.plan ?? "HOST");
  const [capacity, setCapacity] = useState(String(grant?.capacity ?? 1));
  const [permanent, setPermanent] = useState(!grant?.expiresOn);
  const [expiresOn, setExpiresOn] = useState(grant?.expiresOn ?? "");
  const [reason, setReason] = useState("");
  const [retained, setRetained] = useState<string[]>([]);
  const [review, setReview] = useState<Request | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const reviewRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (review) reviewRef.current?.focus(); }, [review]);
  const slots = Number(capacity);
  const validCapacity = Number.isInteger(slots) && slots >= (plan === "PORTFOLIO" ? 50 : plan === "PRO" ? 20 : 1) && slots <= capacityLimit && (plan !== "HOST" || slots === 1 || slots >= 5);
  const needsRetention = occupiedUnits.length > slots;
  const ready = grantAllowed && reason.trim().length >= 3 && validCapacity && (permanent || Boolean(expiresOn)) && (!needsRetention || retained.length === slots);
  function preview(action: "GRANT" | "REVOKE") {
    setError(""); setSuccess("");
    setReview({ action, ...(action === "GRANT" ? { plan, capacity: slots, expiresOn: permanent ? null : expiresOn } : {}), retainedUnitIds: action === "GRANT" && needsRetention ? retained : [], reason: reason.trim(), expectedVersion: version, idempotencyKey: crypto.randomUUID() });
  }
  async function apply() {
    if (!review) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/v1/admin/customers/${customerId}/entitlements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(review) });
      const payload = await response.json() as { data?: { auditId: string }; error?: { code?: string; message?: string } };
      if (!response.ok || !payload.data) {
        const code = payload.error?.code;
        const message = zh ? ({ MEMBERSHIP_CHANGED: "权益已经变更，请刷新后重新预览。", INVALID_EXPIRY: "请选择今天或将来的有效日期。", INVALID_GRANT_CAPACITY: "容量不符合等级要求或超过管理员授权上限。", BILLING_CONFLICT: "请先处理关联或待完成的付费订阅。", CUSTOMER_NOT_ACTIVE: "账户未启用，暂不能授予权益。", NO_ACTIVE_GRANT: "没有可撤销的有效授权。", RETAINED_UNITS_REQUIRED: "请重新选择缩容后保留的房源。", INVALID_RETAINED_UNITS: "保留房源已变更，请刷新并重新选择。" } as Record<string, string>)[code ?? ""] : null;
        throw new Error(message ?? payload.error?.message ?? (zh ? "授权未完成，请重试。" : "The change could not be saved. Try again."));
      }
      setSuccess(`${zh ? "权益变更已保存。审计记录" : "Entitlements saved. Audit record"}: ${payload.data.auditId}`);
      setReview(null); setReason(""); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Save failed"); }
    finally { setPending(false); }
  }
  return <section className="admin-detail-section admin-grant-section" aria-labelledby="admin-grant-heading">
    <h2 id="admin-grant-heading">{zh ? "管理员授予权益" : "Administrator-granted entitlements"}</h2>
    <p>{zh ? `当前等级：${currentPlan}。管理员授权上限 ${capacityLimit} 个房源。` : `Current plan: ${currentPlan}. Administrator capacity limit: ${capacityLimit} objects.`}</p>
    {grant ? <p><strong>{grant.active ? zh ? "有效授权" : "Active grant" : zh ? "已结束授权" : "Ended grant"}: {grant.plan} · {grant.capacity} · {grant.expiresOn ?? (zh ? "长期有效" : "No expiry")}</strong></p> : null}
    <p>{zh ? "授权不收取月费；用量和邮箱验证状态保留。到期或撤销后停止监测并恢复原有等级，历史记录保留30天。" : "Grants have no monthly charge. Usage and email verification are preserved. On expiry or revocation monitoring stops, the base plan returns, and previous history remains readable for 30 days."}</p>
    {!grantAllowed ? <p role="status">{zh ? "当前账户或付费订阅状态不允许新增授权；请先处理关联或待完成的付费订阅。" : "The account or billing state prevents a new grant. Resolve linked or pending paid subscriptions first."}</p> : null}
    <fieldset className="admin-grant-fields" disabled={pending || Boolean(review)}><legend>{zh ? "授权设置" : "Grant settings"}</legend>
      <label>{zh ? "会员等级" : "Membership plan"}<select value={plan} onChange={event => { const next = event.target.value; setPlan(next); setCapacity(String(next === "PORTFOLIO" ? 50 : next === "PRO" ? 20 : 1)); setRetained([]); }}><option value="HOST">Host</option><option value="PRO">Pro</option><option value="PORTFOLIO">Portfolio</option></select></label>
      <label>{zh ? "房源容量" : "Monitored-object capacity"}<input type="number" min={plan === "PORTFOLIO" ? 50 : plan === "PRO" ? 20 : 1} max={capacityLimit} step={1} value={capacity} onChange={event => setCapacity(event.target.value)} /></label>
      <p>{zh ? "Host 支持1个或5个以上；Pro至少20个；Portfolio至少50个。" : "Host supports 1 or at least 5; Pro starts at 20; Portfolio starts at 50."}</p>
      <label className="admin-grant-choice"><input type="checkbox" checked={permanent} onChange={event => setPermanent(event.target.checked)} />{zh ? "长期有效" : "No expiry"}</label>
      {!permanent ? <label>{zh ? "有效至（新西兰日期，包含当天）" : "Valid through (New Zealand date, inclusive)"}<input type="date" value={expiresOn} onChange={event => setExpiresOn(event.target.value)} required /></label> : null}
      <label>{zh ? "授权或撤销原因" : "Grant or revocation reason"}<textarea value={reason} onChange={event => setReason(event.target.value)} minLength={3} maxLength={1000} required /></label>
      {needsRetention && validCapacity ? <fieldset><legend>{zh ? `选择保留房源：${retained.length}/${slots}` : `Retain objects: ${retained.length}/${slots}`}</legend>{occupiedUnits.map(unit => <label className="admin-grant-choice" key={unit.id}><input type="checkbox" checked={retained.includes(unit.id)} onChange={event => setRetained(ids => event.target.checked ? [...ids, unit.id] : ids.filter(id => id !== unit.id))} />{unit.name}</label>)}</fieldset> : null}
      <div className="header-pills"><button type="button" className="button button-primary" disabled={!ready} onClick={() => preview("GRANT")}>{zh ? "预览授权" : "Preview grant"}</button><button type="button" className="button button-danger" disabled={!grant?.active || reason.trim().length < 3} onClick={() => preview("REVOKE")}>{zh ? "预览撤销" : "Preview revocation"}</button></div>
    </fieldset>
    {review ? <div className="admin-grant-review" ref={reviewRef} tabIndex={-1} role="region" aria-label={zh ? "确认权益变更" : "Confirm entitlement change"}>
      <h3>{zh ? "确认权益变更" : "Confirm entitlement change"}</h3>
      <p><strong>{currentPlan} → {review.action === "GRANT" ? `${review.plan} · ${review.capacity} ${zh ? "个房源" : "objects"} · ${review.expiresOn ?? (zh ? "长期有效" : "No expiry")}` : zh ? "撤销授权，恢复原有等级" : "Revoke grant and restore base plan"}</strong></p>
      <p>{zh ? "原因" : "Reason"}: {review.reason}</p>
      {review.action === "REVOKE" || needsRetention ? <p>{zh ? `将停止 ${review.action === "REVOKE" ? occupiedUnits.length : occupiedUnits.length - review.retainedUnitIds.length} 个房源的监测，并取消其待执行采集。房源和用量记录保留。` : `Monitoring will stop for ${review.action === "REVOKE" ? occupiedUnits.length : occupiedUnits.length - review.retainedUnitIds.length} objects and their pending collection will be cancelled. Object and usage records are preserved.`}</p> : null}
      <div className="header-pills"><button type="button" className="button button-secondary" disabled={pending} onClick={() => setReview(null)}>{zh ? "返回修改" : "Back to edit"}</button><button type="button" className="button button-primary" disabled={pending} onClick={() => void apply()}>{pending ? zh ? "保存中…" : "Saving…" : zh ? "确认保存" : "Confirm and save"}</button></div>
    </div> : null}
    {error ? <p role="alert" className="action-message">{error}</p> : null}
    {success ? <p role="status" className="action-message">{success}</p> : null}
  </section>;
}
