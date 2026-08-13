import { prisma, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";

type IntelligenceView = "events" | "signals";

export default async function MarketIntelligencePage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  const view: IntelligenceView = searchParams.view === "signals" ? "signals" : "events";
  const scope = searchParams.scope === "all" ? "all" : "current";
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const region = searchParams.region?.trim().slice(0, 80) ?? "";
  const { page, pageSize, skip } = adminListState(searchParams);
  const now = new Date();
  const nextWeek = new Date(now.getTime() + 7 * 86_400_000);
  const [upcomingEvents, weekEvents, activeSignals, regions] = await Promise.all([
    prisma.eventOccurrence.count({ where: { isDemo: false, startsAt: { gte: now } } }),
    prisma.eventOccurrence.count({ where: { isDemo: false, startsAt: { gte: now, lte: nextWeek } } }),
    prisma.marketSignal.count({ where: { isDemo: false, endsAt: { gte: now } } }),
    prisma.canonicalVenue.findMany({ where: { region: { not: null } }, distinct: ["region"], orderBy: { region: "asc" }, select: { region: true } }),
  ]);
  const regionGroups = groupRegions(regions.flatMap((item) => item.region ? [item.region] : []));
  const regionValues = regionGroups.get(region) ?? [];
  const result = view === "events" ? await loadEvents({ q, regionValues, current: scope === "current", now, locale, skip, take: pageSize }) : await loadSignals({ q, regionValues, current: scope === "current", now, locale, skip, take: pageSize });

  return <section className="admin-page market-intelligence-page">
    <AdminPageHeader title={text.title} description={text.description} actions={<Link className="button button-secondary" href={`/admin/data-explorer?layer=standard&dataset=${view}`}>{text.openExplorer}</Link>} />
    <dl className="collection-summary"><div><dt>{text.upcoming}</dt><dd>{upcomingEvents}</dd></div><div><dt>{text.nextWeek}</dt><dd>{weekEvents}</dd></div><div><dt>{text.activeSignals}</dt><dd>{activeSignals}</dd></div><div><dt>{text.regions}</dt><dd>{regions.length}</dd></div></dl>
    <nav className="data-explorer-tabs intelligence-tabs" aria-label={text.views}><Link href="/admin/market-intelligence?view=events" aria-current={view === "events" ? "page" : undefined}>{text.events}<span>{upcomingEvents}</span></Link><Link href="/admin/market-intelligence?view=signals" aria-current={view === "signals" ? "page" : undefined}>{text.signals}<span>{activeSignals}</span></Link></nav>
    <form className="admin-filters" method="get"><input type="hidden" name="view" value={view} /><label>{text.scope}<select name="scope" defaultValue={scope}><option value="current">{view === "events" ? text.upcomingOnly : text.activeOnly}</option><option value="all">{text.allRecords}</option></select></label><label>{text.region}<select name="region" defaultValue={region}><option value="">{text.allRegions}</option>{[...regionGroups.keys()].map((value) => <option key={value}>{value}</option>)}</select></label><label>{text.search}<input name="q" defaultValue={q} placeholder={text.searchPlaceholder} /></label><button className="button button-secondary" type="submit">{text.apply}</button></form>
    <div className="data-explorer-result-meta"><strong>{view === "events" ? text.canonicalEvents : text.canonicalSignals}</strong><span>{text.count.replace("{count}", result.total.toLocaleString())}</span></div>
    <AdminListSummary locale={locale} total={result.total} tools={<AdminListTools locale={locale} viewName={text.title} />} />
    <AdminTable columns={result.columns} rows={result.rows} emptyTitle={text.empty} emptyBody={text.emptyBody} />
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={result.total} href={(next, size = pageSize) => adminListHref("/admin/market-intelligence", searchParams, { page: Math.max(1, next), pageSize: size })} />
  </section>;
}

async function loadEvents(input: { q: string; regionValues: string[]; current: boolean; now: Date; locale: AdminLocale; skip: number; take: number }) {
  const where: Prisma.EventOccurrenceWhereInput = { isDemo: false, ...(input.current ? { startsAt: { gte: input.now } } : {}), ...(input.regionValues.length ? { venue: { region: { in: input.regionValues } } } : {}), ...(input.q ? { OR: [{ canonicalEvent: { title: { contains: input.q, mode: "insensitive" } } }, { venue: { city: { contains: input.q, mode: "insensitive" } } }, { venue: { name: { contains: input.q, mode: "insensitive" } } }] } : {}) };
  const [total, items] = await Promise.all([prisma.eventOccurrence.count({ where }), prisma.eventOccurrence.findMany({ where, orderBy: { startsAt: input.current ? "asc" : "desc" }, skip: input.skip, take: input.take, include: { canonicalEvent: true, venue: true, sourceLinks: { include: { sourceEventOccurrence: { include: { dataSource: { select: { name: true } } } } } } } })]);
  return { total, columns: [{ key: "event", label: input.locale === "zh" ? "事件" : "Event" }, { key: "location", label: input.locale === "zh" ? "地点" : "Location" }, { key: "starts", label: input.locale === "zh" ? "开始时间" : "Starts" }, { key: "status", label: input.locale === "zh" ? "状态" : "Status" }, { key: "impact", label: input.locale === "zh" ? "价格影响" : "Impact" }, { key: "sources", label: input.locale === "zh" ? "来源" : "Sources" }], rows: items.map((item) => ({ id: item.id, cells: { event: <><strong>{item.canonicalEvent.title}</strong><small>{item.canonicalEvent.category ?? "—"}</small></>, location: [item.venue?.name, item.venue?.city, item.venue?.region ? normalizeRegion(item.venue.region) : null].filter(Boolean).join(" · ") || "—", starts: date(item.startsAt, input.locale), status: <StatusPill value={item.status} locale={input.locale} />, impact: <><StatusPill value={item.impactStatus} locale={input.locale} />{item.impactScore !== null ? <small>{Math.round(item.impactScore * 100)}%</small> : null}</>, sources: [...new Set(item.sourceLinks.map((link) => link.sourceEventOccurrence.dataSource.name))].join(", ") || "—" } })) };
}

async function loadSignals(input: { q: string; regionValues: string[]; current: boolean; now: Date; locale: AdminLocale; skip: number; take: number }) {
  const where: Prisma.MarketSignalWhereInput = { isDemo: false, ...(input.current ? { endsAt: { gte: input.now } } : {}), ...(input.regionValues.length ? { region: { in: input.regionValues } } : {}), ...(input.q ? { OR: [{ marketKey: { contains: input.q, mode: "insensitive" } }, { region: { contains: input.q, mode: "insensitive" } }, { status: { contains: input.q, mode: "insensitive" } }] } : {}) };
  const [total, items] = await Promise.all([prisma.marketSignal.count({ where }), prisma.marketSignal.findMany({ where, orderBy: { startsAt: input.current ? "asc" : "desc" }, skip: input.skip, take: input.take, include: { dataSource: { select: { name: true } }, sourceLinks: { include: { sourceMarketSignal: { include: { dataSource: { select: { name: true } } } } } } } })]);
  return { total, columns: [{ key: "signal", label: input.locale === "zh" ? "信号" : "Signal" }, { key: "market", label: input.locale === "zh" ? "市场" : "Market" }, { key: "region", label: input.locale === "zh" ? "地区" : "Region" }, { key: "window", label: input.locale === "zh" ? "有效期" : "Window" }, { key: "status", label: input.locale === "zh" ? "状态" : "Status" }, { key: "sources", label: input.locale === "zh" ? "来源" : "Sources" }], rows: items.map((item) => ({ id: item.id, cells: { signal: formatAdminValue(input.locale, item.type), market: item.marketKey, region: normalizeRegion(item.region), window: <>{date(item.startsAt, input.locale)}<small>{date(item.endsAt, input.locale)}</small></>, status: <StatusPill value={item.status} locale={input.locale} />, sources: item.dataSource?.name ?? ([...new Set(item.sourceLinks.map((link) => link.sourceMarketSignal.dataSource.name))].join(", ") || "—") } })) };
}

function groupRegions(values: string[]) { const groups = new Map<string, string[]>(); for (const value of values) { const key = normalizeRegion(value); groups.set(key, [...(groups.get(key) ?? []), value]); } return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b))); }
function normalizeRegion(value: string) { return value.replace(/\s+Region$/i, "").replace(/^Manawatu[-\s]Wanganui$/i, "Manawatū-Whanganui").trim(); }

function date(value: Date, locale: AdminLocale) { return value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }); }
const en = { title: "Events & signals", description: "Canonical market intelligence used to explain demand and price movement across New Zealand.", openExplorer: "Open Data Explorer", upcoming: "Upcoming events", nextWeek: "Starting in 7 days", activeSignals: "Active signals", regions: "Regions", views: "Market intelligence views", events: "Events", signals: "Signals", scope: "Time scope", upcomingOnly: "Upcoming events", activeOnly: "Active signals", allRecords: "All records", region: "Region", allRegions: "All regions", search: "Search", searchPlaceholder: "Title, venue, city, market or status", apply: "Apply filters", canonicalEvents: "Canonical event occurrences", canonicalSignals: "Canonical market signals", count: "Showing {count} records", empty: "No market intelligence", emptyBody: "No canonical records match these filters." };
const zh: typeof en = { title: "事件与信号", description: "用于解释新西兰各地需求和价格变化的标准市场情报。", openExplorer: "打开数据浏览器", upcoming: "未来事件", nextWeek: "7 天内开始", activeSignals: "有效信号", regions: "覆盖地区", views: "市场情报视图", events: "事件", signals: "信号", scope: "时间范围", upcomingOnly: "未来事件", activeOnly: "有效信号", allRecords: "全部记录", region: "地区", allRegions: "全部地区", search: "搜索", searchPlaceholder: "标题、场馆、城市、市场或状态", apply: "应用筛选", canonicalEvents: "标准事件场次", canonicalSignals: "标准市场信号", count: "显示 {count} 条记录", empty: "暂无市场情报", emptyBody: "没有符合当前筛选条件的标准记录。" };
