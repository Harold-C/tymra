import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { notFound } from "next/navigation";

import { CustomerAdminActions } from "@/components/admin/membership/CustomerAdminActions";
import { StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue } from "@/lib/admin-i18n";
import { safelyDecryptPersonalData } from "@/lib/server/admin-customer-data";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function Page({ params }: { params: { customerId: string } }) {
  const locale = getAdminLocale();
  const customer = await prisma.customerUser.findUnique({ where: { id: params.customerId }, include: { membership: true, riskCases: { orderBy: { createdAt: "desc" }, take: 20 }, paymentInstruments: { orderBy: { lastSeenAt: "desc" }, take: 20 }, pricingUnits: { include: { sellableUnit: { include: { property: true } } }, orderBy: { createdAt: "desc" } }, membershipUsage: { orderBy: { countedAt: "desc" }, take: 20 }, sessions: { orderBy: { createdAt: "desc" }, take: 20 }, dataRequests: { orderBy: { requestedAt: "desc" }, take: 20 }, priceChecks: { orderBy: { createdAt: "desc" }, take: 10, include: { property: true, unit: true } } } });
  if (!customer) notFound();
  const membership = customer.membership ?? { plan: "FREE", status: "ACTIVE", currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null };
  const email = safelyDecryptPersonalData(customer.encryptedEmail, getEnvironment().DATA_ENCRYPTION_KEY);
  return <div className="admin-page">
    <header className="admin-page-header"><div><h1>{email.readable ? email.value : locale === "zh" ? "邮箱暂不可读取" : "Email unavailable"}</h1><p>{customer.id}</p></div><StatusPill value={customer.status} locale={locale} /></header>
    {!email.readable ? <div className="admin-inline-alert" role="status"><strong>{locale === "zh" ? "此客户的加密邮箱需要修复" : "This customer's encrypted email needs repair"}</strong><span>{locale === "zh" ? "其他账户与会员数据仍可查看和审计。" : "Other account and membership data remains available for review."}</span></div> : null}
    <section className="admin-stat-grid"><article><span>{locale === "zh" ? "方案" : "Plan"}</span><strong>{membership.plan}</strong></article><article><span>{locale === "zh" ? "邮箱" : "Email"}</span><strong>{customer.emailVerifiedAt ? "VERIFIED" : "UNVERIFIED"}</strong></article><article><span>{locale === "zh" ? "权益组" : "Benefit group"}</span><strong>{customer.benefitGroupId ?? "—"}</strong></article><article><span>{locale === "zh" ? "开放风控" : "Open risk"}</span><strong>{customer.riskCases.filter((item) => item.status === "OPEN").length}</strong></article></section>
    <CustomerAdminActions customerId={customer.id} locale={locale} plan={membership.plan} status={membership.status} riskCases={customer.riskCases.map((item) => ({ id: item.id, action: item.action, outcome: item.outcome, reasonCodes: Array.isArray(item.reasonCodes) ? item.reasonCodes.filter((value): value is string => typeof value === "string") : [], appealReason: item.appealReason, status: item.status }))} />
    <section className="admin-detail-section"><div className="admin-section-heading"><h2>{locale === "zh" ? "风控与支付信号" : "Risk and payment signals"}</h2></div><div className="admin-related-grid"><article><h3>{locale === "zh" ? "风控案件" : "Risk cases"}</h3>{customer.riskCases.map((item) => <p key={item.id}><strong>{formatAdminValue(locale, item.action)} · {formatAdminValue(locale, item.outcome)}</strong><br />{formatAdminValue(locale, item.status)} · {Array.isArray(item.reasonCodes) ? item.reasonCodes.filter((value): value is string => typeof value === "string").map((value) => formatAdminValue(locale, value)).join(", ") : "—"}{item.appealReason ? <><br />{locale === "zh" ? "申诉" : "Appeal"}: {item.appealReason}</> : null}</p>)}</article><article><h3>{locale === "zh" ? "支付工具" : "Payment instruments"}</h3>{customer.paymentInstruments.map((item) => <p key={item.id}>{formatAdminValue(locale, item.paymentMethodType ?? "UNKNOWN")} · {formatAdminValue(locale, item.status)}<br /><small>{item.fingerprintHash.slice(0, 12)}…</small></p>)}</article><article><h3>{locale === "zh" ? "用量" : "Usage"}</h3>{customer.membershipUsage.map((usage) => <p key={usage.id}>{formatAdminValue(locale, usage.type)} · {usage.countedAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" })}</p>)}</article></div></section>
  </div>;
}
