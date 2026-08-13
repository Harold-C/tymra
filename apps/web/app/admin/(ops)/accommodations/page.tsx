import { prisma, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";

type AccommodationView = "properties" | "units";

export default async function AccommodationsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  const view: AccommodationView = searchParams.view === "units" ? "units" : "properties";
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const city = searchParams.city?.trim().slice(0, 80) ?? "";
  const { page, pageSize, skip } = adminListState(searchParams);
  const [propertyCount, unitCount, listingCount, relationshipCount, cities] = await Promise.all([
    prisma.property.count({ where: { isDemo: false } }),
    prisma.sellableUnit.count({ where: { isDemo: false } }),
    prisma.listing.count({ where: { isDemo: false } }),
    prisma.competitorRelationship.count({ where: { isDemo: false, validTo: null } }),
    prisma.property.findMany({ where: { isDemo: false }, distinct: ["city"], orderBy: { city: "asc" }, select: { city: true } }),
  ]);
  const propertyBase: Prisma.PropertyWhereInput = { isDemo: false, ...(city ? { city } : {}) };
  const propertyWhere: Prisma.PropertyWhereInput = { ...propertyBase, ...(q ? { OR: [{ canonicalName: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }, { region: { contains: q, mode: "insensitive" } }] } : {}) };
  const unitWhere: Prisma.SellableUnitWhereInput = { isDemo: false, property: propertyBase, ...(q ? { OR: [{ officialName: { contains: q, mode: "insensitive" } }, { canonicalName: { contains: q, mode: "insensitive" } }, { property: { canonicalName: { contains: q, mode: "insensitive" } } }] } : {}) };
  const [total, records] = view === "properties" ? await Promise.all([prisma.property.count({ where: propertyWhere }), prisma.property.findMany({ where: propertyWhere, orderBy: { canonicalName: "asc" }, skip, take: pageSize, include: { _count: { select: { units: true, listings: true, priceChecks: true } } } })]) : await Promise.all([prisma.sellableUnit.count({ where: unitWhere }), prisma.sellableUnit.findMany({ where: unitWhere, orderBy: { officialName: "asc" }, skip, take: pageSize, include: { property: { select: { id: true, canonicalName: true, city: true } }, _count: { select: { listings: true, priceChecks: true, targetRelationships: true } } } })]);
  const rows = view === "properties" ? records.map((item) => "address" in item ? ({ id: item.id, href: `/admin/accommodations/${item.id}`, cells: { record: <><strong>{item.canonicalName}</strong><small>{item.address}</small></>, location: [item.city, item.region].filter(Boolean).join(" · "), type: item.accommodationType, status: <StatusPill value={item.supportStatus} locale={locale} />, units: item._count.units, listings: item._count.listings, checks: item._count.priceChecks } }) : null).filter(Boolean) : records.map((item) => "property" in item ? ({ id: item.id, href: `/admin/accommodations/${item.property.id}#unit-${item.id}`, cells: { record: <><strong>{item.officialName}</strong><small>{item.property.canonicalName}</small></>, location: item.property.city, type: item.unitType, status: <StatusPill value={item.status} locale={locale} />, units: item.capacity, listings: item._count.listings, checks: `${item._count.priceChecks} / ${item._count.targetRelationships}` } }) : null).filter(Boolean);
  return <section className="admin-page accommodations-page">
    <AdminPageHeader title={text.title} description={text.description} />
    <dl className="collection-summary"><div><dt>{text.properties}</dt><dd>{propertyCount}</dd></div><div><dt>{text.units}</dt><dd>{unitCount}</dd></div><div><dt>{text.listings}</dt><dd>{listingCount}</dd></div><div><dt>{text.relationships}</dt><dd>{relationshipCount}</dd></div></dl>
    <nav className="data-explorer-tabs accommodation-tabs" aria-label={text.views}><Link href="/admin/accommodations?view=properties" aria-current={view === "properties" ? "page" : undefined}>{text.properties}<span>{propertyCount}</span></Link><Link href="/admin/accommodations?view=units" aria-current={view === "units" ? "page" : undefined}>{text.units}<span>{unitCount}</span></Link></nav>
    <form className="admin-filters" method="get"><input type="hidden" name="view" value={view} /><label>{text.city}<select name="city" defaultValue={city}><option value="">{text.allCities}</option>{cities.map((item) => <option key={item.city}>{item.city}</option>)}</select></label><label>{text.search}<input name="q" defaultValue={q} placeholder={text.searchPlaceholder} /></label><button className="button button-secondary" type="submit">{text.apply}</button></form>
    <AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={text.title} />} />
    <AdminTable columns={view === "properties" ? [{ key: "record", label: text.property }, { key: "location", label: text.location }, { key: "type", label: text.type }, { key: "status", label: text.status }, { key: "units", label: text.units }, { key: "listings", label: text.listings }, { key: "checks", label: text.checks }] : [{ key: "record", label: text.unit }, { key: "location", label: text.city }, { key: "type", label: text.type }, { key: "status", label: text.status }, { key: "units", label: text.capacity }, { key: "listings", label: text.listings }, { key: "checks", label: text.checksRelationships }]} rows={rows as never} emptyTitle={text.empty} emptyBody={text.emptyBody} />
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={(next, size = pageSize) => adminListHref("/admin/accommodations", searchParams, { page: Math.max(1, next), pageSize: size })} />
  </section>;
}

const en = { title: "Properties & units", description: "Canonical accommodation identities, sellable room types and their operational relationships.", properties: "Properties", units: "Sellable units", listings: "Platform listings", relationships: "Active competitor relationships", views: "Accommodation views", city: "City", allCities: "All cities", search: "Search", searchPlaceholder: "Property, address, region or unit", apply: "Apply filters", property: "Property", unit: "Sellable unit", location: "Location", type: "Type", status: "Status", checks: "Price checks", capacity: "Capacity", checksRelationships: "Checks / competitors", empty: "No accommodation records", emptyBody: "No records match these filters." };
const zh: typeof en = { title: "房源与房型", description: "标准住宿身份、可售房型及其运营关系。", properties: "房源", units: "可售房型", listings: "平台房源", relationships: "有效竞品关系", views: "住宿资产视图", city: "城市", allCities: "全部城市", search: "搜索", searchPlaceholder: "房源、地址、地区或房型", apply: "应用筛选", property: "房源", unit: "可售房型", location: "地点", type: "类型", status: "状态", checks: "价格检查", capacity: "容纳人数", checksRelationships: "检查 / 竞品", empty: "暂无住宿资产记录", emptyBody: "没有符合当前筛选条件的记录。" };
