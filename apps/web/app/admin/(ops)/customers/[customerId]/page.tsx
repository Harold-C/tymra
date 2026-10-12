import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { adminGrantIsActive, effectiveMembership, nzDateKey } from "@tymra/domain";
import { notFound } from "next/navigation";

import { CustomerAdminActions } from "@/components/admin/membership/CustomerAdminActions";
import { AdminEntitlementGrant } from "@/components/admin/membership/AdminEntitlementGrant";
import { adminMembershipGrantHistory } from "@/lib/server/membership/admin-grants";
import { UsageCorrectionForm } from "@/components/admin/membership/UsageCorrectionForm";
import { AdminPagination, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue } from "@/lib/admin-i18n";
import { adminListHref } from "@/lib/admin-list";
import { safelyDecryptPersonalData } from "@/lib/server/admin-customer-data";
import { recordAdminSensitiveAccess } from "@/lib/server/admin-sensitive-access";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { customerMembershipRiskSupport } from "@/lib/server/membership-risk-support";

export default async function Page({ params, searchParams }: { params: { customerId: string }; searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  await recordAdminSensitiveAccess("CustomerUser", params.customerId, "account-billing-risk-and-access");
  const account = await prisma.customerUser.findUnique({ where: { id: params.customerId }, include: { membership: { include: { adminGrant: true } }, paymentInstruments: { orderBy: { lastSeenAt: "desc" }, take: 20 }, pricingUnits: { include: { sellableUnit: { include: { property: true } } }, orderBy: { createdAt: "desc" } }, membershipUsage: { orderBy: { countedAt: "desc" }, take: 20 }, sessions: { orderBy: { createdAt: "desc" }, take: 20 }, dataRequests: { orderBy: { requestedAt: "desc" }, take: 20 }, priceChecks: { orderBy: { createdAt: "desc" }, take: 10, include: { property: true, unit: true } } } });
  if (!account) notFound();
  const [risk, usageRows, grantHistory] = await Promise.all([
    customerMembershipRiskSupport(account.id, searchParams),
    prisma.membershipUsage.findMany({ where: { customerUserId: account.id }, include: { correction: true }, orderBy: { countedAt: "desc" }, take: 100 }),
    adminMembershipGrantHistory(account.id),
  ]);
  const customer = { ...account, riskCases: risk.cases };
  const membership = customer.membership ? effectiveMembership(customer.membership) : { plan: "FREE", status: "ACTIVE", version: 1, currentPeriodEnd: null, cancelAtPeriodEnd: false, graceEndsAt: null };
  const grant = customer.membership?.adminGrant;
  const base = customer.membership;
  const email = safelyDecryptPersonalData(customer.encryptedEmail, getEnvironment().DATA_ENCRYPTION_KEY);
  return <div className="admin-page admin-customer-detail">
    <header className="admin-page-header"><div><h1>{email.readable ? email.value : locale === "zh" ? "邮箱暂不可读取" : "Email unavailable"}</h1><p>{customer.id}</p></div><StatusPill value={customer.status} locale={locale} /></header>
    {!email.readable ? <div className="admin-inline-alert" role="status"><strong>{locale === "zh" ? "此客户的加密邮箱需要修复" : "This customer's encrypted email needs repair"}</strong><span>{locale === "zh" ? "其他账户与会员数据仍可查看和审计。" : "Other account and membership data remains available for review."}</span></div> : null}
    <section className="admin-stat-grid"><article><span>{locale === "zh" ? "方案" : "Plan"}</span><strong>{membership.plan}</strong></article><article><span>{locale === "zh" ? "邮箱" : "Email"}</span><strong>{customer.emailVerifiedAt ? "VERIFIED" : "UNVERIFIED"}</strong></article><article><span>{locale === "zh" ? "权益组" : "Benefit group"}</span><strong>{customer.benefitGroupId ?? "—"}</strong></article><article><span>{locale === "zh" ? "开放风控" : "Open risk"}</span><strong>{risk.open}</strong></article></section>
    <CustomerAdminActions customerId={customer.id} locale={locale} plan={membership.plan} status={membership.status} riskCases={customer.riskCases.map((item) => ({ id: item.id, action: item.action, outcome: item.outcome, reasonCodes: Array.isArray(item.reasonCodes) ? item.reasonCodes.filter((value): value is string => typeof value === "string") : [], appealReason: item.appealReason, status: item.status }))} />
    <AdminEntitlementGrant customerId={customer.id} locale={locale} currentPlan={membership.plan} version={membership.version} capacityLimit={getEnvironment().MEMBERSHIP_ADMIN_GRANT_CAPACITY_LIMIT} grantAllowed={customer.status === "ACTIVE" && (!base || (base.plan === "FREE" && base.status === "ACTIVE" && !base.stripeSubscriptionId && !base.stripeCheckoutSessionId && !base.pendingPlan && !base.pendingChangeKind))} grant={grant ? { plan: grant.plan, capacity: grant.capacity, active: adminGrantIsActive(grant), expiresOn: grant.expiresAt ? nzDateKey(new Date(grant.expiresAt.getTime() - 1)) : null } : null} occupiedUnits={customer.pricingUnits.filter(unit => unit.active || Boolean(unit.slotRetainedUntil && unit.slotRetainedUntil > new Date())).map(unit => ({ id: unit.id, name: `${unit.sellableUnit.property.canonicalName} · ${unit.sellableUnit.officialName}` }))} />
    {grantHistory.length ? <section className="admin-detail-section"><h2>{locale === "zh" ? "权益授权历史" : "Entitlement grant history"}</h2><div className="admin-table-wrap"><table><thead><tr><th>{locale === "zh" ? "时间与管理员" : "Time and administrator"}</th><th>{locale === "zh" ? "动作与原因" : "Action and reason"}</th><th>{locale === "zh" ? "审计记录" : "Audit record"}</th></tr></thead><tbody>{grantHistory.map(item => { const payload = item.payload as { reason?: string }; return <tr key={item.id}><td>{item.createdAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" })}<br />{item.actorAdmin?.email ?? (locale === "zh" ? "系统（到期）" : "System (expiry)")}</td><td>{item.eventType === "admin_membership_granted" ? locale === "zh" ? "授予／调整" : "Grant / adjust" : item.eventType === "admin_membership_grant_revoked" ? locale === "zh" ? "撤销" : "Revoke" : locale === "zh" ? "到期" : "Expire"}<br />{payload.reason ?? "—"}</td><td><a href={`/admin/audit?q=${item.id}`}>{item.id}</a></td></tr>; })}</tbody></table></div></section> : null}
    <section className="admin-detail-section"><div className="admin-section-heading"><h2>{locale === "zh" ? "风控与支付信号" : "Risk and payment signals"}</h2></div><div className="admin-related-grid"><article><h3>{locale === "zh" ? "风控案件" : "Risk cases"}</h3>{customer.riskCases.map((item) => <p key={item.id}><small>{item.id}</small><br /><strong>{formatAdminValue(locale, item.action)} · {formatAdminValue(locale, item.outcome)}</strong><br />{formatAdminValue(locale, item.status)} · {Array.isArray(item.reasonCodes) ? item.reasonCodes.filter((value): value is string => typeof value === "string").map((value) => formatAdminValue(locale, value)).join(", ") : "—"}{item.appealReason ? <><br />{locale === "zh" ? "申诉" : "Appeal"}: {item.appealReason}</> : null}</p>)}</article><article><h3>{locale === "zh" ? "支付工具" : "Payment instruments"}</h3>{customer.paymentInstruments.map((item) => <p key={item.id}>{formatAdminValue(locale, item.paymentMethodType ?? "UNKNOWN")} · {formatAdminValue(locale, item.status)}<br /><small>{item.fingerprintHash.slice(0, 12)}…</small></p>)}</article><article><h3>{locale === "zh" ? "用量" : "Usage"}</h3>{customer.membershipUsage.map((usage) => <p key={usage.id}>{formatAdminValue(locale, usage.type)} · {usage.countedAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" })}</p>)}</article></div>
      <p>{locale === "zh" ? "以下分页用于风控案件；从列表选中的案件会同时显示。" : "Pagination covers risk cases; a case selected from the list is also shown."}</p>
      <AdminPagination locale={locale} page={risk.page} pageSize={risk.pageSize} total={risk.total} href={(next, size = risk.pageSize) => adminListHref(`/admin/customers/${customer.id}`, searchParams, { riskPage: Math.max(1, next), riskPageSize: size })} />
    </section>
    <section className="admin-detail-section"><h2>{locale === "zh" ? "用量核对与重复扣额纠正" : "Usage reconciliation and duplicate correction"}</h2><div className="admin-table-wrap"><table><thead><tr><th>ID</th><th>{locale === "zh" ? "请求与类型" : "Request and type"}</th><th>{locale === "zh" ? "计入时间" : "Counted at"}</th><th>{locale === "zh" ? "纠正记录" : "Correction"}</th></tr></thead><tbody>{usageRows.map(usage => <tr key={usage.id}><td>{usage.id}</td><td>{usage.priceCheckId ? <a href={`/admin/checks/${usage.priceCheckId}`}>{usage.priceCheckId}</a> : "—"}<br />{usage.type}</td><td>{usage.countedAt.toISOString()}</td><td>{usage.correction ? `${usage.correction.originalUsageId} · ${usage.correction.reason}` : "—"}</td></tr>)}</tbody></table></div><UsageCorrectionForm customerId={customer.id} locale={locale} /></section>
  </div>;
}
