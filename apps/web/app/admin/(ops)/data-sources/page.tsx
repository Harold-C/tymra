import { prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function DataSourcesPage() {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  const items = await prisma.dataSource.findMany({
    where: { providerType: { in: ["PUBLIC", "MANUAL"] }, sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] }, isDemo: false },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { collectionRuns: true, sourceEventOccurrences: true, sourceMarketSignals: true, crawlTargets: true } },
      collectionRuns: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, finishedAt: true, startedAt: true } },
    },
  });
  const enabled = items.filter((item) => item.enabled).length;
  const healthy = items.filter((item) => item.operationalStatus === "HEALTHY").length;
  const production = items.filter((item) => item.environments.includes("PRODUCTION") && item.enabled && item.operationalStatus === "HEALTHY").length;
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
    <dl className="collection-summary"><div><dt>{text.total}</dt><dd>{items.length}</dd></div><div><dt>{text.enabled}</dt><dd>{enabled}</dd></div><div><dt>{text.healthy}</dt><dd>{healthy}</dd></div><div><dt>{text.production}</dt><dd>{production}</dd></div></dl>
    <div className="data-explorer-result-meta source-list-heading"><strong>{text.catalog}</strong><span>{text.catalogBody}</span></div>
    <AdminTable columns={[{ key: "source", label: text.source }, { key: "type", label: text.type }, { key: "state", label: text.state }, { key: "lifecycle", label: text.lifecycle }, { key: "records", label: text.records }, { key: "run", label: text.lastRun }]} rows={rows} emptyTitle={text.empty} emptyBody={text.emptyBody} />
  </section>;
}

function date(value: Date | null, locale: AdminLocale) { return value ? value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—"; }
const en = { title: "Data sources", description: "Operational health and collection coverage for every non-OTA source.", manualImport: "Manual import", total: "Sources", enabled: "Enabled", healthy: "Healthy", production: "Production ready", catalog: "Source catalog", catalogBody: "Open a source to inspect its runs, schedules, crawl frontier and data.", source: "Data source", type: "Type", state: "Collection state", lifecycle: "Lifecycle", records: "Records / targets", lastRun: "Latest run", empty: "No data sources", emptyBody: "No non-OTA sources are configured." };
const zh: typeof en = { title: "数据来源", description: "查看所有非 OTA 来源的运行健康和采集覆盖。", manualImport: "手工导入", total: "来源数量", enabled: "已启用", healthy: "健康", production: "生产就绪", catalog: "来源目录", catalogBody: "打开来源可查看运行、计划、抓取前沿和数据。", source: "数据来源", type: "类型", state: "采集状态", lifecycle: "生命周期", records: "记录 / 目标", lastRun: "最近运行", empty: "暂无数据来源", emptyBody: "尚未配置非 OTA 数据来源。" };
