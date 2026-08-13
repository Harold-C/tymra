import { prisma, type Prisma } from "@tymra/db";
import { priceCheckStatuses } from "@tymra/domain";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminListSummary, AdminPagination, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, adminLabel, adminText, formatAdminValue } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function ChecksPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const { page, pageSize, skip } = adminListState(searchParams);
  const status = priceCheckStatuses.includes(searchParams.status as never) ? searchParams.status : undefined;
  const query = searchParams.query?.trim().slice(0, 100) ?? "";
  const where: Prisma.PriceCheckWhereInput = { isDemo: false, ...(status ? { status: status as never } : {}), ...(query ? { OR: [{ id: { contains: query } }, { rawInput: { contains: query, mode: "insensitive" as const } }] } : {}) };
  const [total, checks] = await Promise.all([prisma.priceCheck.count({ where }), prisma.priceCheck.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { property: { select: { canonicalName: true } }, unit: { select: { officialName: true } }, _count: { select: { jobs: true, exceptions: true, resultVersions: true } } } })]);
  const headings = ["Price Check", "Property / Unit", "Status", "Market", "Jobs", "Exceptions", "Created"].map((label) => adminLabel(locale, label));
  const href = (nextPage: number, nextSize = pageSize) => adminListHref("/admin/checks", searchParams, { page: Math.max(1, nextPage), pageSize: nextSize });
  return <section className="admin-page"><AdminPageHeader title={adminText(locale, "navChecks")} description={adminText(locale, "checksDescription")} /><form className="admin-filters" method="get"><label>{adminText(locale, "search")}<input name="query" defaultValue={query} placeholder={adminText(locale, "searchPlaceholder")} /></label><label>{adminText(locale, "status")}<select name="status" defaultValue={status ?? ""}><option value="">{adminText(locale, "allStatuses")}</option>{priceCheckStatuses.map((value) => <option value={value} key={value}>{formatAdminValue(locale, value)}</option>)}</select></label><button className="button button-secondary" type="submit">{adminText(locale, "applyFilters")}</button></form><AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={adminText(locale, "navChecks")} />} /><div className="admin-table-wrap"><table className="admin-table" data-admin-table><thead><tr>{headings.map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>{checks.map((check) => <tr key={check.id}><td><Link href={`/admin/checks/${check.id}`}><strong>{check.property?.canonicalName ?? check.rawInput}</strong><small>{check.id}</small></Link></td><td>{check.property?.canonicalName ?? adminText(locale, "unconfirmed")}<small>{check.unit?.officialName ?? adminText(locale, "noUnit")}</small></td><td><StatusPill value={check.status} locale={locale} /></td><td>{check.marketKey}</td><td>{check._count.jobs}</td><td>{check._count.exceptions}</td><td>{check.createdAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" })}</td></tr>)}</tbody></table>{!checks.length ? <div className="admin-empty"><h2>{adminText(locale, "noChecks")}</h2><p>{adminText(locale, "noFilteredRecords")}</p></div> : null}</div><AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={href} /></section>;
}
