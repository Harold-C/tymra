import { prisma } from "@tymra/db";
import { Activity, Building2, ClipboardCheck, Database, Search } from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function AdminSearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const sourceScope = { providerType: { in: ["PUBLIC", "MANUAL"] as Array<"PUBLIC" | "MANUAL"> }, sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] as Array<"PUBLIC_DATA" | "MANUAL_IMPORT"> }, isDemo: false };
  const [checks, runs, sources, properties] = q ? await Promise.all([
    prisma.priceCheck.findMany({ where: { OR: [{ id: { contains: q, mode: "insensitive" } }, { rawInput: { contains: q, mode: "insensitive" } }] }, orderBy: { createdAt: "desc" }, take: 10, include: { property: { select: { canonicalName: true } } } }),
    prisma.collectionRun.findMany({ where: { dataSource: sourceScope, OR: [{ id: { contains: q, mode: "insensitive" } }, { errorCode: { contains: q, mode: "insensitive" } }, { dataSource: { name: { contains: q, mode: "insensitive" } } }] }, orderBy: { createdAt: "desc" }, take: 10, include: { dataSource: { select: { name: true } } } }),
    prisma.dataSource.findMany({ where: { ...sourceScope, OR: [{ name: { contains: q, mode: "insensitive" } }, { key: { contains: q, mode: "insensitive" } }] }, orderBy: { name: "asc" }, take: 10 }),
    prisma.property.findMany({ where: { OR: [{ canonicalName: { contains: q, mode: "insensitive" } }, { address: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }] }, orderBy: { canonicalName: "asc" }, take: 10, include: { _count: { select: { units: true, listings: true } } } }),
  ]) : [[], [], [], []];
  const total = checks.length + runs.length + sources.length + properties.length;

  return <section className="admin-page admin-search-page">
    <AdminPageHeader title={text.title} description={text.description} />
    <form className="admin-search-form" method="get"><Search size={18} /><input name="q" defaultValue={q} autoFocus placeholder={text.placeholder} /><button className="button button-primary" type="submit">{text.search}</button></form>
    {!q ? <div className="admin-empty"><h2>{text.startTitle}</h2><p>{text.startBody}</p></div> : total ? <div className="admin-search-results">
      <ResultGroup title={text.checks} icon={<ClipboardCheck size={17} />} items={checks.map((item) => ({ href: `/admin/checks/${item.id}`, title: item.property?.canonicalName ?? item.rawInput, meta: item.id, status: item.status }))} locale={locale} />
      <ResultGroup title={text.runs} icon={<Activity size={17} />} items={runs.map((item) => ({ href: `/admin/collection-runs/${item.id}`, title: item.dataSource.name, meta: item.id, status: item.status }))} locale={locale} />
      <ResultGroup title={text.sources} icon={<Database size={17} />} items={sources.map((item) => ({ href: `/admin/data-sources/${item.key}`, title: item.name, meta: item.key, status: item.operationalStatus }))} locale={locale} />
      <ResultGroup title={text.properties} icon={<Building2 size={17} />} items={properties.map((item) => ({ href: `/admin/accommodations/${item.id}`, title: item.canonicalName, meta: `${item.city} · ${item._count.units} ${text.units} · ${item._count.listings} ${text.listings}`, status: item.supportStatus }))} locale={locale} />
    </div> : <div className="admin-empty"><h2>{text.noResults}</h2><p>{text.noResultsBody.replace("{query}", q)}</p></div>}
  </section>;
}

function ResultGroup({ title, icon, items, locale }: { title: string; icon: React.ReactNode; items: Array<{ href: string; title: string; meta: string; status: string }>; locale: "en" | "zh" }) {
  if (!items.length) return null;
  return <section><h2>{icon}{title}<span>{items.length}</span></h2><div>{items.map((item) => <Link href={item.href} key={item.href}><span><strong>{item.title}</strong><small>{item.meta}</small></span><StatusPill value={item.status} locale={locale} /></Link>)}</div></section>;
}

const en = { title: "Search operations", description: "Find price checks, collection runs, data sources and accommodation records.", placeholder: "Enter an ID, source, property or address", search: "Search", startTitle: "Search across operations", startBody: "Use a run ID, check ID, source name, property name or address.", noResults: "No results", noResultsBody: "Nothing matched “{query}”.", checks: "Price checks", runs: "Collection runs", sources: "Data sources", properties: "Accommodation", units: "units", listings: "listings" };
const zh: typeof en = { title: "全局搜索", description: "查找价格检查、采集运行、数据来源和住宿资产记录。", placeholder: "输入 ID、来源、房源或地址", search: "搜索", startTitle: "搜索整个运营后台", startBody: "可以使用运行 ID、检查 ID、来源名称、房源名称或地址。", noResults: "没有搜索结果", noResultsBody: "没有找到与“{query}”匹配的记录。", checks: "价格检查", runs: "采集运行", sources: "数据来源", properties: "住宿资产", units: "个房型", listings: "个平台房源" };
