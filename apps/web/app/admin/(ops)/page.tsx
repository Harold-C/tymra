import { prisma } from "@tymra/db";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Database, RadioTower } from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const locale = getAdminLocale();
  const text = copy(locale);
  const now = new Date();
  const since = new Date(now.getTime() - 86_400_000);
  const sourceScope = { providerType: { in: ["PUBLIC", "MANUAL"] as Array<"PUBLIC" | "MANUAL"> }, sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] as Array<"PUBLIC_DATA" | "MANUAL_IMPORT"> }, isDemo: false };
  const [businessOpen, collectionOpen, activeChecks, sources, recentRuns, failedRuns, activeJobs, upcomingEvents, activeSignals, workerHealth] = await Promise.all([
    prisma.exceptionCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.collectionIncident.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.priceCheck.count({ where: { status: { in: ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING", "EXCEPTION"] }, isDemo: false } }),
    prisma.dataSource.findMany({ where: sourceScope, orderBy: { name: "asc" }, select: { key: true, name: true, enabled: true, operationalStatus: true, lastSuccessAt: true, errorRate: true } }),
    prisma.collectionRun.findMany({ where: { dataSource: sourceScope, isDemo: false }, orderBy: { createdAt: "desc" }, take: 8, include: { dataSource: { select: { name: true } }, incident: { select: { status: true, severity: true } } } }),
    prisma.collectionRun.count({ where: { dataSource: sourceScope, isDemo: false, status: { in: ["FAILED", "PARTIAL"] }, createdAt: { gte: since } } }),
    prisma.job.count({ where: { type: { in: ["PUBLIC_DATA_COLLECTION", "EVENT_COLLECTION", "WEATHER_COLLECTION", "TRANSPORT_COLLECTION"] }, status: { in: ["PENDING", "RUNNING"] } } }),
    prisma.eventOccurrence.count({ where: { isDemo: false, startsAt: { gte: now } } }),
    prisma.marketSignal.count({ where: { isDemo: false, endsAt: { gte: now } } }),
    loadWorkerHealth(),
  ]);
  const healthySources = sources.filter((source) => source.enabled && source.operationalStatus === "HEALTHY").length;
  const sourceHealthItems = [...sources].sort((left, right) => {
    const leftAttention = !left.enabled || left.operationalStatus !== "HEALTHY" ? 0 : 1;
    const rightAttention = !right.enabled || right.operationalStatus !== "HEALTHY" ? 0 : 1;
    return leftAttention - rightAttention || left.name.localeCompare(right.name);
  }).slice(0, 8);
  const attentionCount = businessOpen + collectionOpen;
  const runRows = recentRuns.map((run) => ({
    id: run.id,
    href: `/admin/collection-runs/${run.id}`,
    cells: {
      run: <><span className="code-value">{run.id}</span><small>{run.dataSource.name}</small></>,
      status: <StatusPill value={run.status} locale={locale} />,
      records: `${run.successCount} / ${run.failureCount}`,
      incident: run.incident ? <><StatusPill value={run.incident.severity} locale={locale} /> <StatusPill value={run.incident.status} locale={locale} /></> : "—",
      started: date(run.startedAt ?? run.createdAt, locale),
    },
  }));

  return (
    <section className="admin-page admin-overview-page">
      <AdminPageHeader title={text.title} description={text.description} actions={<span className="overview-updated">{text.updated} {date(now, locale)}</span>} />
      <div className="overview-priority-grid">
        <Link className={`overview-priority ${attentionCount ? "has-warning" : "is-clear"}`} href="/admin/exceptions">
          <span className="overview-priority-icon">{attentionCount ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
          <div><span>{text.actionQueue}</span><strong>{attentionCount}</strong><small>{text.actionQueueBody.replace("{business}", String(businessOpen)).replace("{collection}", String(collectionOpen))}</small></div>
          <ArrowRight size={17} />
        </Link>
        <Link className="overview-priority" href="/admin/checks">
          <span className="overview-priority-icon"><Activity size={20} /></span>
          <div><span>{text.activeChecks}</span><strong>{activeChecks}</strong><small>{text.activeChecksBody}</small></div>
          <ArrowRight size={17} />
        </Link>
        <Link className={`overview-priority ${failedRuns ? "has-warning" : ""}`} href="/admin/collection-runs">
          <span className="overview-priority-icon"><Database size={20} /></span>
          <div><span>{text.collectionHealth}</span><strong>{healthySources}<em> / {sources.length}</em></strong><small>{text.collectionHealthBody.replace("{failed}", String(failedRuns)).replace("{jobs}", String(activeJobs))}</small></div>
          <ArrowRight size={17} />
        </Link>
        <Link className="overview-priority" href="/admin/market-intelligence">
          <span className="overview-priority-icon"><RadioTower size={20} /></span>
          <div><span>{text.marketIntelligence}</span><strong>{upcomingEvents}<em> / {activeSignals}</em></strong><small>{text.marketIntelligenceBody}</small></div>
          <ArrowRight size={17} />
        </Link>
      </div>

      <div className="overview-workspace-grid">
        <section className="overview-section">
          <header><div><h2>{text.recentRuns}</h2><p>{text.recentRunsBody}</p></div><Link href="/admin/collection-runs">{text.viewAll}<ArrowRight size={14} /></Link></header>
          <AdminTable columns={[{ key: "run", label: text.run }, { key: "status", label: text.status }, { key: "records", label: text.records }, { key: "incident", label: text.incident }, { key: "started", label: text.started }]} rows={runRows} emptyTitle={text.noRuns} emptyBody={text.noRunsBody} />
        </section>
        <aside className="overview-section overview-source-health">
          <header><div><h2>{text.sourceHealth}</h2><p>{text.sourceHealthBody}</p></div><Link href="/admin/data-sources">{text.manage}<ArrowRight size={14} /></Link></header>
          <ul>
            <li><div className="overview-health-static"><span><strong>Argus</strong><small>{workerHealth.argus.message ?? `${text.latency} ${workerHealth.argus.latencyMs ?? 0} ms`}</small></span><span><StatusPill value={workerHealth.argus.healthy && workerHealth.argus.ready ? "HEALTHY" : "UNHEALTHY"} locale={locale} /></span></div></li>
            {sourceHealthItems.map((source) => <li key={source.key}><Link href={`/admin/data-sources/${source.key}`}><span><strong>{source.name}</strong><small>{source.lastSuccessAt ? `${text.lastSuccess} ${date(source.lastSuccessAt, locale)}` : text.neverSucceeded}</small></span><span><StatusPill value={source.enabled ? source.operationalStatus : "PAUSED"} locale={locale} /><small>{Math.round(source.errorRate * 100)}%</small></span></Link></li>)}
          </ul>
          {!sourceHealthItems.length ? <p className="empty-inline">{text.noSources}</p> : null}
        </aside>
      </div>
    </section>
  );
}

function date(value: Date, locale: AdminLocale) {
  return value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" });
}

function copy(locale: AdminLocale) {
  return locale === "zh" ? zh : en;
}

type WorkerHealth = {
  argus: { healthy: boolean; ready: boolean; latencyMs?: number; message?: string };
};

async function loadWorkerHealth(): Promise<WorkerHealth> {
  try {
    const response = await fetch(`${process.env.WORKER_INTERNAL_URL ?? "http://tymra-worker-api:3100"}/worker/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error(`Worker health returned HTTP ${response.status}`);
    return await response.json() as WorkerHealth;
  } catch (error) {
    return { argus: { healthy: false, ready: false, message: error instanceof Error ? error.message : "Worker health unavailable" } };
  }
}

const en = {
  title: "Operations overview", description: "Current workload, collection health and market data readiness in one operational view.", updated: "Updated", actionQueue: "Action queue", actionQueueBody: "{business} business · {collection} collection", activeChecks: "Active price checks", activeChecksBody: "Requests currently moving through the analysis pipeline", collectionHealth: "Healthy sources", collectionHealthBody: "{failed} failed/partial in 24h · {jobs} active jobs", marketIntelligence: "Upcoming events / signals", marketIntelligenceBody: "Canonical records currently available for pricing analysis", recentRuns: "Recent collection runs", recentRunsBody: "Latest non-OTA collection execution across all sources.", viewAll: "View all", run: "Run", status: "Status", records: "Success / failure", incident: "Incident", started: "Started", noRuns: "No collection runs", noRunsBody: "Collection runs will appear after a source is executed.", sourceHealth: "Source health", sourceHealthBody: "Argus readiness plus enabled state, operational status and latest successful collection.", manage: "Manage", lastSuccess: "Last success", neverSucceeded: "No successful run", noSources: "No non-OTA data sources are configured.", latency: "Latency",
};
const zh: typeof en = {
  title: "运营总览", description: "在一个工作视图中掌握当前待办、采集健康和市场数据准备情况。", updated: "更新时间", actionQueue: "待办队列", actionQueueBody: "业务异常 {business} · 采集异常 {collection}", activeChecks: "进行中的价格检查", activeChecksBody: "正在分析流程中处理的客户请求", collectionHealth: "健康数据来源", collectionHealthBody: "24 小时失败/部分成功 {failed} · 活跃任务 {jobs}", marketIntelligence: "未来事件 / 有效信号", marketIntelligenceBody: "当前可用于价格分析的标准数据记录", recentRuns: "最近采集运行", recentRunsBody: "所有非 OTA 来源最近的采集执行记录。", viewAll: "查看全部", run: "运行", status: "状态", records: "成功 / 失败", incident: "异常", started: "开始时间", noRuns: "暂无采集运行", noRunsBody: "执行数据来源后，运行记录会显示在这里。", sourceHealth: "来源健康", sourceHealthBody: "Argus 就绪状态，以及来源启用、运行健康和最近成功采集时间。", manage: "管理", lastSuccess: "最近成功", neverSucceeded: "尚无成功运行", noSources: "尚未配置非 OTA 数据来源。", latency: "延迟",
};
