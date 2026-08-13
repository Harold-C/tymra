import { getEnvironment } from "@tymra/config";
import { prisma, type CustomerStatus, type Prisma } from "@tymra/db";

import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { safelyDecryptPersonalData } from "@/lib/server/admin-customer-data";
import { getAdminLocale } from "@/lib/server/admin-locale";

const statuses: CustomerStatus[] = ["ACTIVE", "SUSPENDED", "DELETED"];

export default async function CustomersPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  const { page, pageSize, skip } = adminListState(searchParams);
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const status = statuses.includes(searchParams.status as CustomerStatus) ? searchParams.status as CustomerStatus : undefined;
  const where: Prisma.CustomerUserWhereInput = { ...(status ? { status } : {}), ...(q ? { id: { contains: q, mode: "insensitive" } } : {}) };
  const [total, customers] = await Promise.all([
    prisma.customerUser.count({ where }),
    prisma.customerUser.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { membership: true, _count: { select: { priceChecks: true, sessions: true, pricingUnits: true } } } }),
  ]);
  const key = getEnvironment().DATA_ENCRYPTION_KEY;
  const decoded = customers.map((customer) => ({ customer, email: safelyDecryptPersonalData(customer.encryptedEmail, key) }));
  const unreadable = decoded.filter((item) => !item.email.readable).length;
  const pageHref = (nextPage: number, nextSize = pageSize) => adminListHref("/admin/customers", searchParams, { page: Math.max(1, nextPage), pageSize: nextSize });
  return <section className="admin-page">
    <AdminPageHeader title={text.title} description={text.description} />
    {unreadable ? <div className="admin-inline-alert" role="status"><strong>{text.unreadable.replace("{count}", String(unreadable))}</strong><span>{text.unreadableBody}</span></div> : null}
    <form className="admin-filters" method="get"><label>{text.search}<input name="q" defaultValue={q} placeholder={text.searchPlaceholder} /></label><label>{text.status}<select name="status" defaultValue={status ?? ""}><option value="">{text.allStatuses}</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button-secondary" type="submit">{text.apply}</button></form>
    <AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={text.title} />} />
    <AdminTable columns={[{ key: "email", label: "Email" }, { key: "customer", label: text.customerStatus }, { key: "plan", label: text.plan }, { key: "checks", label: text.checks }, { key: "units", label: text.units }, { key: "created", label: text.created }]} rows={decoded.map(({ customer, email }) => ({ id: customer.id, href: `/admin/customers/${customer.id}`, cells: { email: email.readable ? <><strong>{email.value}</strong><small>{customer.id}</small></> : <><strong>{text.emailUnavailable}</strong><small>{customer.id}</small></>, customer: <StatusPill value={customer.status} locale={locale} />, plan: customer.membership?.plan ?? "FREE", checks: customer._count.priceChecks, units: customer._count.pricingUnits, created: customer.createdAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" }) } }))} emptyTitle={text.empty} emptyBody={text.emptyBody} />
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={pageHref} />
  </section>;
}

const en = { title: "Customers", description: "Review accounts, plans, usage entry points and sessions. Impersonation is not available.", unreadable: "{count} record(s) need encryption repair", unreadableBody: "Other customer records remain available. Review the server-side key-version diagnostic before migration.", search: "Search", searchPlaceholder: "Customer ID", status: "Customer status", allStatuses: "All statuses", apply: "Apply filters", customerStatus: "Customer status", plan: "Plan", checks: "Checks", units: "Units", created: "Created", emailUnavailable: "Email unavailable", empty: "No customers", emptyBody: "No customers match these filters." };
const zh: typeof en = { title: "会员客户", description: "查看账户、方案、用量入口与会话状态；不提供模拟登录。", unreadable: "有 {count} 条记录需要修复加密数据", unreadableBody: "其他客户记录仍可正常查看；迁移前请检查服务端密钥版本诊断。", search: "搜索", searchPlaceholder: "客户 ID", status: "客户状态", allStatuses: "全部状态", apply: "应用筛选", customerStatus: "客户状态", plan: "方案", checks: "检查", units: "单位", created: "创建时间", emailUnavailable: "邮箱暂不可读取", empty: "没有会员", emptyBody: "没有符合当前筛选条件的会员。" };
