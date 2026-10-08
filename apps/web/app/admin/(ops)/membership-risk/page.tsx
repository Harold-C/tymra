import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { formatAdminValue } from "@/lib/admin-i18n";
import { adminListHref } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { listMembershipRiskCases, membershipRiskStatuses, membershipRiskSummary } from "@/lib/server/membership-risk-support";

export default async function MembershipRiskPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const t = locale === "zh" ? zh : en;
  const [list, summary] = await Promise.all([
    listMembershipRiskCases(searchParams),
    membershipRiskSummary(new Date(Date.now() - 30 * 86_400_000)),
  ]);
  const { total, cases, page, pageSize, q, status, period } = list;
  return <section className="admin-page">
    <AdminPageHeader title={t.title} description={t.description} />
    <section className="admin-stat-grid">
      <article><span>{t.cases}</span><strong>{summary.total}</strong></article>
      <article><span>{t.open}</span><strong>{summary.open}</strong></article>
      <article><span>{t.appealed}</span><strong>{summary.appealed}</strong></article>
      <article><span>{t.rate}</span><strong>{summary.reviewed ? `${Math.round(summary.approved / summary.reviewed * 100)}%` : "—"}</strong></article>
    </section>
    <section className="admin-detail-section">
      <div className="admin-section-heading"><h2>{t.reasons}</h2></div>
      <div className="risk-reason-list">{summary.topReasons.map(({ reason, count }) => <span key={reason}><strong>{formatAdminValue(locale, reason)}</strong><em>{count}</em></span>)}</div>
    </section>
    <form className="admin-filters" method="get">
      <label>{t.search}<input name="q" defaultValue={q} placeholder={t.searchPlaceholder} /></label>
      <label>{t.status}<select name="status" defaultValue={status ?? ""}><option value="">{t.allStatuses}</option>{membershipRiskStatuses.map(value => <option value={value} key={value}>{formatAdminValue(locale, value)}</option>)}</select></label>
      <label>{t.period}<select name="period" defaultValue={period}><option value="all">{t.allDates}</option><option value="30d">{t.last30Days}</option></select></label>
      <button className="button button-secondary" type="submit">{t.apply}</button>
    </form>
    <AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={t.title} />} />
    <AdminTable
      columns={[{ key: "customer", label: t.customer }, { key: "action", label: t.action }, { key: "outcome", label: t.outcome }, { key: "status", label: t.status }, { key: "reasons", label: t.caseReasons }]}
      rows={cases.map(item => ({
        id: item.id,
        href: item.customerUserId ? `/admin/customers/${item.customerUserId}?riskCase=${item.id}` : undefined,
        cells: {
          customer: item.customerUserId ? <><strong>{t.reviewCustomer}</strong><small>{item.customerUserId}</small></> : "—",
          action: formatAdminValue(locale, item.action), outcome: formatAdminValue(locale, item.outcome),
          status: <StatusPill value={item.status} locale={locale} />,
          reasons: Array.isArray(item.reasonCodes) ? item.reasonCodes.filter((reason): reason is string => typeof reason === "string").map(reason => formatAdminValue(locale, reason)).join(", ") : "—",
        },
      }))}
      emptyTitle={t.empty} emptyBody={t.emptyBody}
    />
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={(next, size = pageSize) => adminListHref("/admin/membership-risk", searchParams, { page: Math.max(1, next), pageSize: size })} />
  </section>;
}
const en = { title: "Membership risk", description: "Review account risk and appeals. All dates are included by default; summary trends cover the last 30 days.", cases: "30-day cases", open: "Open · all dates", appealed: "30-day appeals", rate: "30-day review approval rate", reasons: "30-day top reason codes", caseReasons: "Reasons", search: "Search", searchPlaceholder: "Customer ID or action", status: "Status", allStatuses: "All statuses", period: "Date range", allDates: "All dates", last30Days: "Last 30 days", apply: "Apply filters", customer: "Customer", reviewCustomer: "Review case", action: "Action", outcome: "Outcome", empty: "No risk cases", emptyBody: "No risk cases match these filters." };
const zh: typeof en = { title: "会员风控", description: "审查账户风险与申诉。列表默认包含全部日期；汇总趋势统计近 30 天。", cases: "30 天案件", open: "待处理 · 全部日期", appealed: "30 天申诉", rate: "30 天复核放行率", reasons: "30 天主要原因", caseReasons: "原因", search: "搜索", searchPlaceholder: "客户 ID 或动作", status: "状态", allStatuses: "全部状态", period: "日期范围", allDates: "全部日期", last30Days: "近 30 天", apply: "应用筛选", customer: "客户", reviewCustomer: "查看案件", action: "动作", outcome: "结果", empty: "没有风控案件", emptyBody: "没有符合当前筛选条件的案件。" };
