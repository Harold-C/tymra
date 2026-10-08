import { prisma, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListSummary, AdminPagination, StatusPill } from "@/components/admin/AdminTable";
import { ServiceRecoveryAction } from "@/components/admin/ServiceRecoveryAction";
import { adminDateLocale, formatAdminValue } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { redactServicePayload } from "@/lib/server/service-payload";
import { serviceErrorCopy } from "@/lib/service-operation-copy";

export const dynamic = "force-dynamic";

export default async function DeliveriesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale(), zh = locale === "zh";
  const { page, pageSize, skip } = adminListState(searchParams);
  const statuses = ["FAILED", "PENDING", "SENDING", "SENT", "CANCELLED"];
  const status = statuses.includes(searchParams.status ?? "") ? searchParams.status! : "ATTENTION";
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const where: Prisma.EmailDeliveryWhereInput = {
    status: status === "ATTENTION" ? { in: ["FAILED", "SENDING"] } : status as never,
    ...(q ? { OR: [{ id: { contains: q } }, { priceCheckId: { contains: q } }] } : {}),
  };
  const [total, deliveries] = await Promise.all([
    prisma.emailDelivery.count({ where }),
    prisma.emailDelivery.findMany({ where, orderBy: { queuedAt: "asc" }, skip, take: pageSize, include: { resultVersion: { select: { status: true, version: true } } } }),
  ]);
  const acceptance = await prisma.auditEvent.findMany({ where: { eventType: "notification_provider_accepted", entityType: "EmailDelivery", entityId: { in: deliveries.map(row => row.id) } }, orderBy: { createdAt: "desc" }, take: pageSize });
  const date = (value: Date) => value.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" });

  return <section className="admin-page">
    <AdminPageHeader title={zh ? "通知与交付" : "Notifications and delivery"} description={zh ? "结果可访问、通知处理和收件分别判断。已发送表示提供方已接受，不表示用户已收件。" : "Result access, notification processing and receipt are separate. Sent means provider acceptance, not verified customer receipt."} />
    <form className="admin-filters" method="get">
      <label>{zh ? "搜索" : "Search"}<input name="q" defaultValue={q} placeholder={zh ? "通知或请求编号" : "Notification or request ID"} /></label>
      <label>{zh ? "通知状态" : "Notification status"}<select name="status" defaultValue={status}>
        <option value="ATTENTION">{zh ? "需要处理或核验" : "Needs action or verification"}</option>
        {statuses.map(value => <option key={value} value={value}>{formatAdminValue(locale, value)}</option>)}
      </select></label>
      <button className="button button-secondary">{zh ? "筛选" : "Apply"}</button>
    </form>
    <AdminListSummary locale={locale} total={total} />
    <div className="detail-sections">{deliveries.map(delivery => {
      const proof = acceptance.find(row => row.entityId === delivery.id);
      return <section key={delivery.id}>
        <h2>{formatAdminValue(locale, delivery.type)}</h2>
        <dl className="detail-list">
          <div><dt>{zh ? "通知编号" : "Notification"}</dt><dd className="code-value">{delivery.id}</dd></div>
          <div><dt>{zh ? "原始请求" : "Original request"}</dt><dd>{delivery.priceCheckId ? <Link href={`/admin/checks/${delivery.priceCheckId}`}>{delivery.priceCheckId}</Link> : "—"}</dd></div>
          <div><dt>{zh ? "结果版本" : "Result version"}</dt><dd>{delivery.resultVersion ? `${delivery.resultVersion.version} · ${formatAdminValue(locale, delivery.resultVersion.status)}` : "—"}</dd></div>
          <div><dt>{zh ? "通知状态" : "Notification status"}</dt><dd><StatusPill locale={locale} value={delivery.status} /></dd></div>
          <div><dt>{zh ? "发送方式" : "Provider"}</dt><dd>{delivery.provider}</dd></div>
          <div><dt>{zh ? "尝试次数" : "Attempts"}</dt><dd>{delivery.attemptCount}</dd></div>
          <div><dt>{zh ? "排队时间" : "Queued"}</dt><dd>{date(delivery.queuedAt)}</dd></div>
          <div><dt>{zh ? "发送记录时间" : "Recorded send time"}</dt><dd>{delivery.sentAt ? date(delivery.sentAt) : "—"}</dd></div>
          {delivery.lastError ? <div><dt>{zh ? "处理提示" : "Processing note"}</dt><dd>{serviceErrorCopy(locale, delivery.lastError)}</dd></div> : null}
        </dl>
        {delivery.status === "SENDING" ? <p role="status">{zh ? "发送正在进行或结果尚未核实。先核对提供方记录及审计证据；当前状态禁止重新发送，避免重复通知。" : "Sending is in progress or its outcome is unverified. Check provider records and audit evidence. Resending is blocked in this state to avoid duplicate notifications."}</p> : null}
        {proof ? <details><summary>{zh ? "提供方接受证据" : "Provider acceptance evidence"}</summary><pre className="evidence-block">{JSON.stringify(redactServicePayload(proof.payload), null, 2)}</pre></details> : null}
        {delivery.status === "FAILED" && (!delivery.resultVersion || delivery.resultVersion.status === "PUBLISHED") ? <ServiceRecoveryAction locale={locale} endpoint={`/api/v1/admin/deliveries/${delivery.id}/actions`} label={zh ? "恢复通知" : "Recover notification"} /> : null}
      </section>;
    })}</div>
    {!deliveries.length ? <div className="admin-empty"><h2>{zh ? "当前范围没有通知" : "No notifications in this view"}</h2><p>{zh ? "调整状态筛选查看其他通知记录。" : "Change the status filter to inspect other records."}</p></div> : null}
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={(next, size = pageSize) => adminListHref("/admin/deliveries", searchParams, { page: next, pageSize: size })} />
  </section>;
}
