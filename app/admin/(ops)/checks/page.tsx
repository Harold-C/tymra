import { prisma } from "@tymra/db";
import { priceCheckStatuses } from "@tymra/domain";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, adminLabel, adminText } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function ChecksPage({ searchParams }: { searchParams: { status?: string; query?: string } }) {
  const locale = getAdminLocale();
  const checks = await prisma.priceCheck.findMany({ where: { ...(searchParams.status ? { status: searchParams.status as never } : {}), ...(searchParams.query ? { OR: [{ id: { contains: searchParams.query } }, { rawInput: { contains: searchParams.query, mode: "insensitive" as const } }] } : {}) }, orderBy: { createdAt: "desc" }, take: 100, include: { property: { select: { canonicalName: true } }, unit: { select: { officialName: true } }, _count: { select: { jobs: true, exceptions: true, resultVersions: true } } } });
  const headings = ["Price Check", "Property / Unit", "Status", "Market", "Jobs", "Exceptions", "Created"].map((label) => adminLabel(locale, label));
  return <section className="admin-page"><AdminPageHeader title={adminText(locale, "navChecks")} description={adminText(locale, "checksDescription")} /><form className="admin-filters" method="get"><label>{adminText(locale, "search")}<input name="query" defaultValue={searchParams.query ?? ""} placeholder={adminText(locale, "searchPlaceholder")} /></label><label>{adminText(locale, "status")}<select name="status" defaultValue={searchParams.status ?? ""}><option value="">{adminText(locale, "allStatuses")}</option>{priceCheckStatuses.map((status) => <option key={status}>{status.replaceAll("_", " ")}</option>)}</select></label><button className="button button-secondary" type="submit">{adminText(locale, "applyFilters")}</button></form><div className="admin-table-wrap"><table className="admin-table"><thead><tr>{headings.map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>{checks.map((check) => <tr key={check.id}><td><Link href={`/admin/checks/${check.id}`}>{check.id}</Link><small>{check.rawInput}</small></td><td>{check.property?.canonicalName ?? adminText(locale, "unconfirmed")}<small>{check.unit?.officialName ?? adminText(locale, "noUnit")}</small></td><td><StatusPill value={check.status} locale={locale} /></td><td>{check.marketKey}</td><td>{check._count.jobs}</td><td>{check._count.exceptions}</td><td>{check.createdAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" })}</td></tr>)}</tbody></table>{!checks.length ? <div className="admin-empty"><h2>{adminText(locale, "noChecks")}</h2><p>{adminText(locale, "noFilteredRecords")}</p></div> : null}</div></section>;
}
