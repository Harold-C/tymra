import { prisma } from "@tymra/db";

import { AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function Page() {
  const locale = getAdminLocale();
  const since = new Date(Date.now() - 30 * 86_400_000);
  const cases = await prisma.membershipRiskCase.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 500 });
  const open = cases.filter((item) => item.status === "OPEN").length;
  const appealed = cases.filter((item) => item.appealReason).length;
  const approved = cases.filter((item) => item.status === "APPROVED").length;
  const reviewed = cases.filter((item) => ["APPROVED", "DENIED"].includes(item.status)).length;
  const topReasons = [...cases.reduce((map, item) => {
    if (Array.isArray(item.reasonCodes)) for (const reason of item.reasonCodes) if (typeof reason === "string") map.set(reason, (map.get(reason) ?? 0) + 1);
    return map;
  }, new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return <div className="admin-page">
    <header className="admin-page-header"><div><span>MEMBER ABUSE POLICY V1</span><h1>{locale === "zh" ? "会员风控" : "Membership risk"}</h1><p>{locale === "zh" ? "按原因码校准挑战、冷却、重复权益与人工复核；共享 IP 不会单独触发封禁。" : "Calibrate challenges, cooldowns, duplicate benefits and reviews by reason code; shared IP never blocks on its own."}</p></div></header>
    <section className="admin-stat-grid"><article><span>{locale === "zh" ? "30 天案件" : "30-day cases"}</span><strong>{cases.length}</strong></article><article><span>{locale === "zh" ? "待处理" : "Open"}</span><strong>{open}</strong></article><article><span>{locale === "zh" ? "已申诉" : "Appealed"}</span><strong>{appealed}</strong></article><article><span>{locale === "zh" ? "复核放行率" : "Review approval rate"}</span><strong>{reviewed ? `${Math.round(approved / reviewed * 100)}%` : "—"}</strong></article></section>
    <section className="admin-detail-section"><div className="admin-section-heading"><h2>{locale === "zh" ? "主要原因码" : "Top reason codes"}</h2></div><div className="admin-filter-bar">{topReasons.map(([reason, count]) => <span key={reason}><strong>{reason}</strong> · {count}</span>)}</div></section>
    <AdminTable columns={[{ key: "customer", label: locale === "zh" ? "客户" : "Customer" }, { key: "action", label: locale === "zh" ? "动作" : "Action" }, { key: "outcome", label: locale === "zh" ? "结果" : "Outcome" }, { key: "status", label: locale === "zh" ? "状态" : "Status" }, { key: "reasons", label: locale === "zh" ? "原因" : "Reasons" }]} rows={cases.map((item) => ({ id: item.id, href: item.customerUserId ? `/admin/customers/${item.customerUserId}` : undefined, cells: { customer: item.customerUserId ?? "—", action: item.action, outcome: item.outcome, status: <StatusPill value={item.status} locale={locale} />, reasons: Array.isArray(item.reasonCodes) ? item.reasonCodes.join(", ") : "—" } }))} emptyTitle={locale === "zh" ? "近 30 天没有风控案件" : "No risk cases in 30 days"} emptyBody="" />
  </div>;
}
