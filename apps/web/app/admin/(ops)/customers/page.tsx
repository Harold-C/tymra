import { getEnvironment } from "@tymra/config";
import { decryptPersonalData, prisma } from "@tymra/db";

import { AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function Page() {
  const locale = getAdminLocale();
  const customers = await prisma.customerUser.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { membership: true, _count: { select: { priceChecks: true, sessions: true, pricingUnits: true } } } });
  const key = getEnvironment().DATA_ENCRYPTION_KEY;
  return <div className="admin-page"><header className="admin-page-header"><div><span>{locale === "zh" ? "会员运营" : "MEMBERSHIP OPERATIONS"}</span><h1>{locale === "zh" ? "会员客户" : "Customers"}</h1><p>{locale === "zh" ? "查看账户、方案、用量入口与会话状态；不提供模拟登录。" : "Review accounts, plans, usage entry points and sessions. Impersonation is not available."}</p></div></header><AdminTable columns={[{ key: "email", label: "Email" }, { key: "customer", label: locale === "zh" ? "客户状态" : "Customer status" }, { key: "plan", label: locale === "zh" ? "方案" : "Plan" }, { key: "checks", label: locale === "zh" ? "检查" : "Checks" }, { key: "units", label: locale === "zh" ? "单位" : "Units" }, { key: "created", label: locale === "zh" ? "创建时间" : "Created" }]} rows={customers.map((customer) => ({ id: customer.id, href: `/admin/customers/${customer.id}`, cells: { email: decryptPersonalData(customer.encryptedEmail, key), customer: <StatusPill value={customer.status} locale={locale} />, plan: customer.membership?.plan ?? "FREE", checks: customer._count.priceChecks, units: customer._count.pricingUnits, created: customer.createdAt.toLocaleString(locale === "zh" ? "zh-NZ" : "en-NZ", { timeZone: "Pacific/Auckland" }) } }))} emptyTitle={locale === "zh" ? "没有会员" : "No customers"} emptyBody={locale === "zh" ? "独立会员登录后会出现在这里。" : "Customers appear after independent member sign-in."} /></div>;
}
