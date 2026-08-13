import { prisma, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function DataSourcesPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  const { page, pageSize, skip } = adminListState(searchParams);
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const healthStates = ["HEALTHY", "DEGRADED", "DOWN", "UNCONFIGURED", "BLOCKED"];
  const health = healthStates.includes(searchParams.health ?? "") ? searchParams.health : undefined;
  const enabled = searchParams.enabled === "true" ? true : searchParams.enabled === "false" ? false : undefined;
  const scope: Prisma.DataSourceWhereInput = { providerType: { in: ["PUBLIC", "MANUAL"] }, sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] }, isDemo: false };
  const where: Prisma.DataSourceWhereInput = { ...scope, ...(health ? { operationalStatus: health as never } : {}), ...(enabled === undefined ? {} : { enabled }), ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { key: { contains: q, mode: "insensitive" } }] } : {}) };
  const [total, totalSources, enabledCount, healthy, production, items] = await Promise.all([
    prisma.dataSource.count({ where }), prisma.dataSource.count({ where: scope }), prisma.dataSource.count({ where: { ...scope, enabled: true } }), prisma.dataSource.count({ where: { ...scope, operationalStatus: "HEALTHY" } }), prisma.dataSource.count({ where: { ...scope, environments: { has: "PRODUCTION" }, enabled: true, operationalStatus: "HEALTHY" } }), prisma.dataSource.findMany({
    where,
    orderBy: { name: "asc" },
    skip,
    take: pageSize,
    include: {
      _count: { select: { collectionRuns: true, sourceEventOccurrences: true, sourceMarketSignals: true, crawlTargets: true } },
      collectionRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, finishedAt: true, startedAt: true } },
    },
  })]);
  const rows = items.map((item) => {
    const lastRun = item.collectionRuns[0];
    return {
      id: item.id,
      href: `/admin/data-sources/${item.key}`,
      cells: {
        source: <><strong>{item.name}</strong><small>{item.key}</small></>,
        type: item.providerType,
        state: <><StatusPill value={item.enabled ? "ENABLED" : "PAUSED"} locale={locale} /> <StatusPill value={item.operationalStatus} locale={locale} /></>,
        lifecycle: <StatusPill value={item.lifecycle} locale={locale} />,
        records: `${item._count.sourceEventOccurrences + item._count.sourceMarketSignals} / ${item._count.crawlTargets}`,
        run: lastRun ? <><StatusPill value={lastRun.status} locale={locale} /><small>{date(lastRun.finishedAt ?? lastRun.startedAt, locale)}</small></> : "—",
      },
    };
  });
  return <section className="admin-page data-sources-page">
    <AdminPageHeader title={text.title} description={text.description} actions={<Link className="button button-secondary" href="/admin/data-sources/import">{text.manualImport}</Link>} />
    <dl className="collection-summary"><div><dt>{text.total}</dt><dd>{totalSources}</dd></div><div><dt>{text.enabled}</dt><dd>{enabledCount}</dd></div><div><dt>{text.healthy}</dt><dd>{healthy}</dd></div><div><dt>{text.production}</dt><dd>{production}</dd></div></dl>
    <form className="admin-filters" method="get"><label>{text.search}<input name="q" defaultValue={q} placeholder={text.searchPlaceholder} /></label><label>{text.state}<select name="enabled" defaultValue={enabled === undefined ? "" : String(enabled)}><option value="">{text.allStates}</option><option value="true">{text.enabledOnly}</option><option value="false">{text.pausedOnly}</option></select></label><label>{text.healthFilter}<select name="health" defaultValue={health ?? ""}><option value="">{text.allHealth}</option>{healthStates.map((value) => <option value={value} key={value}>{formatAdminValue(locale, value)}</option>)}</select></label><button className="button button-secondary" type="submit">{text.apply}</button></form>
    <div className="data-explorer-result-meta source-list-heading"><strong>{text.catalog}</strong><span>{text.catalogBody}</span></div>
    <AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={text.title} />} />
    <AdminTable columns={[{ key: "source", label: text.source }, { key: "type", label: text.type }, { key: "state", label: text.state }, { key: "lifecycle", label: text.lifecycle }, { key: "records", label: text.records }, { key: "run", label: text.lastRun }]} rows={rows} emptyTitle={text.empty} emptyBody={text.emptyBody} />
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={(nextPage, nextSize = pageSize) => adminListHref("/admin/data-sources", searchParams, { page: Math.max(1, nextPage), pageSize: nextSize })} />
  </section>;
}

function date(value: Date | null, locale: AdminLocale) { return value ? value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—"; }
const en = { title: "Data sources", description: "Operational health and collection coverage for every non-OTA source.", manualImport: "Manual import", total: "Sources", enabled: "Enabled", healthy: "Healthy", production: "Production ready", catalog: "Source catalog", catalogBody: "Open a source to inspect its runs, schedules, crawl frontier and data.", source: "Data source", type: "Type", state: "Collection state", lifecycle: "Lifecycle", records: "Records / targets", lastRun: "Latest run", empty: "No data sources", emptyBody: "No non-OTA sources are configured.", search: "Search", searchPlaceholder: "Source name or key", allStates: "All collection states", enabledOnly: "Enabled", pausedOnly: "Paused", healthFilter: "Operational health", allHealth: "All health states", apply: "Apply filters" };
const zh: typeof en = { title: "数据来源", description: "查看所有非 OTA 来源的运行健康和采集覆盖。", manualImport: "手工导入", total: "来源数量", enabled: "已启用", healthy: "健康", production: "生产就绪", catalog: "来源目录", catalogBody: "打开来源可查看运行、计划、抓取前沿和数据。", source: "数据来源", type: "类型", state: "采集状态", lifecycle: "生命周期", records: "记录 / 目标", lastRun: "最近运行", empty: "暂无数据来源", emptyBody: "尚未配置非 OTA 数据来源。", search: "搜索", searchPlaceholder: "来源名称或键值", allStates: "全部采集状态", enabledOnly: "仅已启用", pausedOnly: "仅已暂停", healthFilter: "运行健康", allHealth: "全部健康状态", apply: "应用筛选" };
