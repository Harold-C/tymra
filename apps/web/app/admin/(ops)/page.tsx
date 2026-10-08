import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { runtimeScheduleStatus } from "@tymra/domain";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Database, Mail } from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const locale = getAdminLocale();
  const zh = locale === "zh";
  const environment = getEnvironment();
  const now = new Date();
  const since = new Date(now.getTime() - 86_400_000);
  const [open, collectionOpen, activeChecks, sources, recentRuns, failedRuns, queued, deliveries, oldest, enabledSchedules, affected, billingFailures, worker] = await Promise.all([
    prisma.exceptionCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.collectionIncident.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.priceCheck.count({ where: { status: { in: ["QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING", "EXCEPTION"] }, isDemo: false } }),
    prisma.dataSource.findMany({ where: { isDemo: false }, orderBy: { name: "asc" }, select: { key: true, name: true, enabled: true, operationalStatus: true, healthStatus: true, lastSuccessAt: true, errorRate: true } }),
    prisma.collectionRun.findMany({ where: { isDemo: false }, orderBy: { createdAt: "desc" }, take: 8, include: { dataSource: { select: { name: true } }, incident: { select: { status: true, severity: true } } } }),
    prisma.collectionRun.count({ where: { isDemo: false, status: { in: ["FAILED", "PARTIAL"] }, createdAt: { gte: since } } }),
    prisma.job.count({ where: { status: "PENDING" } }),
    prisma.emailDelivery.count({ where: { AND: [{ OR: [{ status: "FAILED" }, { status: "SENDING", OR: [{ lastError: "DELIVERY_OUTCOME_UNVERIFIED" }, { queuedAt: { lt: new Date(now.getTime() - 300000) } }] }] }, { OR: [{ priceCheckId: null }, { priceCheck: { isDemo: false } }] }] } }),
    prisma.job.findFirst({ where: { status: "PENDING", runAt: { lte: now } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    prisma.scheduleDefinition.count({ where: { enabled: true } }),
    prisma.priceCheck.findMany({ where: { isDemo: false, customerUserId: { not: null }, exceptions: { some: { status: { in: ["OPEN", "IN_PROGRESS"] }, blockingUser: true } } }, select: { customerUserId: true }, distinct: ["customerUserId"] }),
    prisma.stripeBillingEvent.count({ where: { processedAt: null, processingError: { not: null } } }),
    loadWorkerHealth(environment.WORKER_INTERNAL_URL),
  ]);
  const incidents = open + collectionOpen;
  const sourceHealthItems = [...sources].sort((a, b) => Number(a.operationalStatus === "HEALTHY") - Number(b.operationalStatus === "HEALTHY") || a.name.localeCompare(b.name)).slice(0, 8);
  const scheduler = worker.available ? runtimeScheduleStatus({ development: environment.NODE_ENV === "development", schedulerEnabled: worker.scheduler?.enabled === true, enabledSchedules }) : "UNKNOWN";
  const healthySources = sources.filter(source => source.healthStatus === "HEALTHY" && source.operationalStatus === "HEALTHY").length;
  const cards = [
    { href: "/admin/exceptions", title: zh ? "未解决事件" : "Unresolved incidents", value: incidents, detail: zh ? `请求 ${open} · 采集 ${collectionOpen} · 受影响用户 ${affected.length}` : `${open} requests · ${collectionOpen} collection · ${affected.length} affected customers`, warning: incidents > 0, icon: AlertTriangle },
    { href: "/admin/jobs", title: zh ? "待执行任务" : "Queued work", value: queued, detail: zh ? `进行中的请求 ${activeChecks} · 最久等待 ${oldest ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 60000) + " 分钟" : "—"}` : `${activeChecks} active requests · oldest wait ${oldest ? Math.floor((now.getTime() - oldest.createdAt.getTime()) / 60000) + "m" : "—"}`, warning: false, icon: Activity },
    { href: "/admin/data-sources", title: zh ? "已核实健康来源" : "Sources reporting healthy", value: `${healthySources} / ${sources.length}`, detail: zh ? `主动暂停 ${sources.filter(s => !s.enabled).length} · 24 小时失败历史 ${failedRuns}` : `${sources.filter(s => !s.enabled).length} paused · ${failedRuns} failed runs in 24h history`, warning: false, icon: Database },
    { href: "/admin/deliveries", title: zh ? "通知失败" : "Failed notifications", value: deliveries, detail: zh ? `支付同步待处理 ${billingFailures} · 发送与结果可访问分别核验` : `${billingFailures} billing sync failures · delivery checked separately from result access`, warning: deliveries > 0, icon: Mail },
  ];
  const dependencies = [
    [zh ? "后台进程" : "Admin process", true],
    ["Worker", worker.available ? worker.worker?.healthy : undefined],
    [zh ? "数据库" : "Database", worker.database?.healthy],
    ["Redis", worker.redis?.healthy],
    ["Argus", worker.argus?.healthy && worker.argus?.ready],
  ] as const;
  return <section className="admin-page admin-overview-page">
    <AdminPageHeader title={zh ? "服务总览" : "Service overview"} description={zh ? "掌握当前故障、任务积压、数据时效和交付状态。历史失败保留，恢复按实际证据判断。" : "Current faults, backlog, data age and delivery. Historical failures remain visible; recovery requires execution evidence."} actions={<span className="overview-updated">{date(now, locale)}</span>} />
    <div className="overview-priority-grid">{cards.map(card => <Link key={card.href} className={`overview-priority ${card.warning ? "has-warning" : ""}`} href={card.href}><span className="overview-priority-icon"><card.icon size={20} /></span><div><span>{card.title}</span><strong>{card.value}</strong><small>{card.detail}</small></div><ArrowRight size={17} /></Link>)}</div>
    <section className="overview-section"><header><div><h2>{zh ? "环境与运行证据" : "Environment and runtime evidence"}</h2><p>{zh ? "生产调度开启是正常运行状态；受控验收的暂停门禁单独检查。" : "Enabled production scheduling is normal. Bounded acceptance gates are checked separately."}</p></div><Link href="/admin/settings">{zh ? "系统详情" : "System details"}</Link></header>
      <dl className="detail-list"><div><dt>{zh ? "环境" : "Environment"}</dt><dd>{environment.NODE_ENV}</dd></div><div><dt>{zh ? "调度运行状态" : "Scheduler runtime"}</dt><dd><StatusPill value={scheduler} locale={locale} /> · {enabledSchedules} {zh ? "条已启用计划" : "enabled schedules"}</dd></div><div><dt>{zh ? "实际发布版本" : "Runtime release"}</dt><dd>{process.env.TYMRA_RELEASE_VERSION ?? (zh ? "运行环境未声明" : "Not declared by this runtime")}</dd></div><div><dt>{zh ? "源码版本" : "Source revision"}</dt><dd>{process.env.TYMRA_SOURCE_REVISION ?? (zh ? "运行环境未声明" : "Not declared by this runtime")}</dd></div><div><dt>{zh ? "检查范围" : "Evidence scope"}</dt><dd>{zh ? "持久任务、来源状态与当前 Worker 健康检查；不代表客户已收到通知。" : "Persisted jobs and source state plus current Worker health. This does not prove recipient receipt."}</dd></div></dl>
      <div className="header-pills">{dependencies.map(([name, healthy]) => <span key={name}>{name} <StatusPill value={healthy === undefined ? "UNKNOWN" : healthy ? "HEALTHY" : "UNHEALTHY"} locale={locale} /></span>)}</div>
      {!worker.available ? <p className="action-message" role="status">{zh ? "Worker 状态无法取得，依赖健康未核实。" : "Worker status is unavailable; dependency health is unverified."}</p> : null}
      <ul>{(worker.alerts ?? []).map((alert, i) => <li key={i}>{alert.code} · {alert.severity} · {alert.message}</li>)}</ul>
    </section>
    <div className="overview-workspace-grid"><section className="overview-section"><header><div><h2>{zh ? "最近采集运行" : "Recent collection runs"}</h2><p>{zh ? "公共和 OTA 来源的同一执行记录。" : "One execution record for public and OTA supply."}</p></div><Link href="/admin/collection-runs">{zh ? "查看全部" : "View all"}</Link></header>
      <AdminTable columns={[{ key: "run", label: zh ? "运行" : "Run" }, { key: "status", label: zh ? "状态" : "Status" }, { key: "records", label: zh ? "成功 / 失败" : "Success / failure" }, { key: "incident", label: zh ? "事件" : "Incident" }, { key: "started", label: zh ? "开始" : "Started" }]} rows={recentRuns.map(run => ({ id: run.id, href: `/admin/collection-runs/${run.id}`, cells: { run: <><span className="code-value">{run.id}</span><small>{run.dataSource.name}</small></>, status: <StatusPill value={run.status} locale={locale} />, records: `${run.successCount} / ${run.failureCount}`, incident: run.incident ? <StatusPill value={run.incident.status} locale={locale} /> : "—", started: date(run.startedAt ?? run.createdAt, locale) } }))} emptyTitle={zh ? "暂无运行" : "No runs"} emptyBody={zh ? "执行后显示持久运行记录。" : "Persisted runs appear after execution."} />
    </section><aside className="overview-section overview-source-health"><header><div><h2>{zh ? "来源健康与数据时效" : "Source health and data age"}</h2><p>{zh ? "采集意图、观测健康及最近成功分别显示。" : "Collection intent, observed health and last success are separate."}</p></div><Link href="/admin/data-sources">{zh ? "管理" : "Manage"}</Link></header>
      <ul>{sourceHealthItems.map(source => <li key={source.key}><Link href={`/admin/data-sources/${source.key}`}><span><strong>{source.name}</strong><small>{source.lastSuccessAt ? `${date(source.lastSuccessAt, locale)} · ${Math.floor((now.getTime() - source.lastSuccessAt.getTime()) / 3600000)}h` : zh ? "尚无成功记录" : "No successful run"}</small></span><span><StatusPill value={source.operationalStatus} locale={locale} />{!source.enabled ? <small>{zh ? "主动暂停" : "Paused"}</small> : null}</span></Link></li>)}</ul>
      {!sources.length ? <p className="empty-inline">{zh ? "暂无来源" : "No sources"}</p> : null}
    </aside></div>
  </section>;
}

type WorkerHealth = { available: boolean; process?: { healthy: boolean }; worker?: { healthy: boolean }; database?: { healthy: boolean }; redis?: { healthy: boolean }; argus?: { healthy: boolean; ready: boolean }; scheduler?: { enabled: boolean }; alerts?: Array<{ code: string; severity: string; message?: string }> };
async function loadWorkerHealth(url: string | undefined): Promise<WorkerHealth> {
  try {
    const response = await fetch(`${url ?? "http://tymra-worker-api:3100"}/worker/health`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { available: false };
    return { ...await response.json(), available: true } as WorkerHealth;
  } catch { return { available: false }; }
}
function date(value: Date, locale: AdminLocale) {
  return value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" });
}
