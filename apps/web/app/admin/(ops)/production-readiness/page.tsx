import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { AlertTriangle, CheckCircle2, CircleX, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { getAdminLocale } from "@/lib/server/admin-locale";

export const dynamic = "force-dynamic";

export default async function ProductionReadinessPage() {
  const locale = getAdminLocale();
  const t = locale === "zh" ? zh : en;
  const environment = getEnvironment();
  const [sources, enabledSchedules, failedJobs, argus, otaHealth] = await Promise.all([
    prisma.dataSource.findMany({ where: { providerType: "PUBLIC", isDemo: false }, orderBy: { key: "asc" }, select: { key: true, name: true, enabled: true, operationalStatus: true } }),
    prisma.scheduleDefinition.count({ where: { enabled: true } }),
    prisma.job.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, select: { id: true, type: true, status: true, lastErrorCode: true }, orderBy: { createdAt: "asc" }, take: 500 }),
    loadArgusHealth(),
    loadOtaHealth(),
  ]);
  const candidates = sources.filter((source) => source.enabled);
  const external = failedJobs.filter((job) => /SOURCE_UNAVAILABLE|RATE_LIMITED|ACCESS_CHALLENGE/.test(job.lastErrorCode ?? "")).length;
  const retryable = failedJobs.filter((job) => job.status === "FAILED" && !/SOURCE_UNAVAILABLE|RATE_LIMITED|ACCESS_CHALLENGE/.test(job.lastErrorCode ?? "") && /TIMEOUT|NETWORK|LEASE|UNAVAILABLE/.test(job.lastErrorCode ?? "")).length;
  const sourceBlockers: ReadinessBlocker[] = candidates.flatMap((source) => {
    const reasons = [
      ...(source.operationalStatus !== "HEALTHY" ? [t.healthBlocked] : []),
    ];
    return reasons.length ? [{ id: `source:${source.key}`, title: source.name, detail: reasons.join(" · "), owner: t.ownerCollection, href: `/admin/data-sources/${source.key}` }] : [];
  });
  const otaBlockers: ReadinessBlocker[] = otaHealth.sources.flatMap((source) => source.releaseGate.failures.map((failure, index) => ({ id: `ota:${source.key}:${index}`, title: source.key, detail: failure, owner: t.ownerOta, href: "/admin/argus-manual-actions" })));
  const otaReady = otaHealth.sources.filter((source) => source.releaseGate.ready).length;
  const blockers: ReadinessBlocker[] = [
    ...(environment.NODE_ENV !== "development" && environment.SCHEDULER_ENABLED ? [{ id: "scheduler-runtime", title: t.schedulerRuntimeBlocked, detail: t.schedulerRuntimeDetail, owner: t.ownerPlatform, href: "/admin/collection-control" }] : []),
    ...(enabledSchedules ? [{ id: "enabled-schedules", title: t.schedulesBlocked.replace("{count}", String(enabledSchedules)), detail: t.schedulesBlockedDetail, owner: t.ownerCollection, href: "/admin/collection-control" }] : []),
    ...(!argus.healthy || !argus.ready ? [{ id: "argus", title: t.argusBlocked, detail: argus.message ?? t.argusBlockedDetail, owner: t.ownerOta, href: "/admin/argus-manual-actions" }] : []),
    ...(otaHealth.error ? [{ id: "ota-health", title: t.otaHealth, detail: otaHealth.error, owner: t.ownerOta, href: "/admin/argus-manual-actions" }] : []),
    ...(failedJobs.length ? [{ id: "failed-jobs", title: t.failedJobsBlocker.replace("{count}", String(failedJobs.length)), detail: t.queueDetail.replace("{retry}", String(retryable)).replace("{external}", String(external)), owner: t.ownerCollection, href: "/admin/collection-runs?status=FAILED" }] : []),
    ...sourceBlockers,
    ...otaBlockers,
  ];
  const cards = [
    { label: t.health, value: `${candidates.filter((source) => source.operationalStatus === "HEALTHY").length} / ${candidates.length}`, ok: candidates.every((source) => source.operationalStatus === "HEALTHY"), detail: t.healthDetail },
    { label: t.schedules, value: String(enabledSchedules), ok: enabledSchedules === 0 && (environment.NODE_ENV === "development" || !environment.SCHEDULER_ENABLED), detail: environment.NODE_ENV !== "development" && environment.SCHEDULER_ENABLED ? t.schedulerOn : t.schedulerOff },
    { label: "Argus", value: argus.healthy && argus.ready ? t.ready : t.blocked, ok: argus.healthy && argus.ready, detail: argus.message ?? `${argus.latencyMs ?? 0} ms` },
    { label: t.otaHealth, value: `${otaReady} / ${otaHealth.sources.length || 9}`, ok: !otaHealth.error && otaReady === otaHealth.sources.length, detail: t.otaHealthDetail },
    { label: t.queue, value: String(failedJobs.length), ok: failedJobs.length === 0, detail: t.queueDetail.replace("{retry}", String(retryable)).replace("{external}", String(external)) },
    { label: t.canary, value: blockers.length ? t.blocked : t.ready, ok: blockers.length === 0, detail: t.canaryDetail },
  ];

  return <section className="admin-page admin-overview-page production-readiness-page">
    <AdminPageHeader title={t.title} description={t.description} actions={<StatusPill value={blockers.length ? "BLOCKED" : "READY"} locale={locale} />} />
    <div className="overview-priority-grid">
      {cards.map((card) => <article className={`overview-priority ${card.ok ? "is-clear" : "has-warning"}`} key={card.label}>
        <span className="overview-priority-icon">{card.ok ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />}</span>
        <div><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></div>
      </article>)}
    </div>
    <div className="overview-workspace-grid">
      <section className="overview-section">
        <header><div><h2>{t.blockers}</h2><p>{t.blockersDetail}</p></div><ShieldCheck size={20} /></header>
        {blockers.length ? <ul className="run-diagnostics readiness-blockers has-danger">{blockers.map((blocker) => <li className="danger" key={blocker.id}><CircleX size={16} /><span><strong>{blocker.title}</strong><small>{blocker.detail}</small><small>{t.owner}: {blocker.owner} · {t.checked}: {new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", { timeZone: "Pacific/Auckland" })}</small></span><Link href={blocker.href}>{t.resolve}</Link></li>)}</ul> : <div className="admin-empty compact"><CheckCircle2 size={24} /><h3>{t.noBlockers}</h3><p>{t.noBlockersDetail}</p></div>}
      </section>
      <aside className="overview-section">
        <header><div><h2>{t.boundary}</h2><p>{t.boundaryDetail}</p></div></header>
        <dl className="detail-list"><div><dt>{t.mode}</dt><dd>READ_ONLY_BOUNDED</dd></div><div><dt>{t.passes}</dt><dd>2</dd></div><div><dt>{t.stop}</dt><dd>{t.stopDetail}</dd></div><div><dt>{t.rollback}</dt><dd>{t.rollbackDetail}</dd></div></dl>
      </aside>
    </div>
    <section className="overview-section">
      <header><div><h2>{t.otaEvidence}</h2><p>{t.otaEvidenceDetail}</p></div></header>
      {otaHealth.sources.length ? <ul className={`run-diagnostics ${otaReady === otaHealth.sources.length ? "is-clear" : "has-danger"}`}>{otaHealth.sources.map((source) => <li className={source.releaseGate.ready ? "clear" : "danger"} key={source.key}><span><strong>{source.key}</strong><small>{t.otaCounts.replace("{listings}", String(source.positiveListingCount)).replace("{rates}", String(source.positiveRateCount)).replace("{empty}", percent(source.emptyResultRate)).replace("{blocked}", percent(source.policyBlockedRate)).replace("{challenge}", percent(source.challengeRate)).replace("{limited}", percent(source.rateLimitRate)).replace("{parser}", percent(source.parsingFailureRate)).replace("{latency}", source.averageResponseMs === null ? "—" : `${source.averageResponseMs} ms`)}</small></span><StatusPill value={source.releaseGate.ready ? "READY" : "BLOCKED"} locale={locale} /></li>)}</ul> : <div className="admin-empty compact"><CircleX size={24} /><h3>{t.otaUnavailable}</h3><p>{otaHealth.error ?? t.otaUnavailableDetail}</p></div>}
    </section>
  </section>;
}

type ArgusHealth = { healthy: boolean; ready: boolean; latencyMs?: number; message?: string };
type ReadinessBlocker = { id: string; title: string; detail: string; owner: string; href: string };
type OtaHealthSource = { key: string; positiveListingCount: number; positiveRateCount: number; emptyResultRate: number; policyBlockedRate: number; challengeRate: number; rateLimitRate: number; parsingFailureRate: number; averageResponseMs: number | null; releaseGate: { ready: boolean; failures: string[] } };
type OtaHealth = { sources: OtaHealthSource[]; error?: string };
async function loadArgusHealth(): Promise<ArgusHealth> {
  try {
    const response = await fetch(`${process.env.WORKER_INTERNAL_URL ?? "http://tymra-worker-api:3100"}/worker/health`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const health = await response.json() as { argus: ArgusHealth };
    return health.argus;
  } catch (error) { return { healthy: false, ready: false, message: error instanceof Error ? error.message : "Unavailable" }; }
}

async function loadOtaHealth(): Promise<OtaHealth> {
  try {
    const response = await fetch(`${process.env.WORKER_INTERNAL_URL ?? "http://tymra-worker-api:3100"}/worker/ota-health?windowDays=30`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json() as OtaHealth;
  } catch (error) { return { sources: [], error: error instanceof Error ? error.message : "Unavailable" }; }
}

function percent(value: number) { return `${Math.round(value * 100)}%`; }

const en = { title: "Production readiness", description: "One fail-closed view of source health, schedules, Argus, queue history and the bounded canary gate.", health: "Operational health", healthDetail: "Enabled sources currently healthy", otaHealth: "OTA evidence health", otaHealthDetail: "Platforms passing recent positive listing and rate gates", schedules: "Enabled schedules", schedulerOn: "Scheduler runtime is on", schedulerOff: "Scheduler runtime is off", ready: "READY", blocked: "BLOCKED", queue: "Failed queue history", queueDetail: "{retry} retry eligible · {external} externally blocked", canary: "Canary gate", canaryDetail: "Ready only when every prerequisite is green", blockers: "Release blockers", blockersDetail: "Every item here must be resolved before running a production canary.", noBlockers: "No current blocker", noBlockersDetail: "The bounded canary may be run with its explicit confirmation token.", boundary: "Canary safety boundary", boundaryDetail: "The runner stops on the first unsafe result and never enables schedules.", mode: "Mode", passes: "Passes per source", stop: "Stop conditions", stopDetail: "configuration, schedule, parser, repeat growth, remote evidence", rollback: "Rollback", rollbackDetail: "Disable schedules and cancel pending collection work", healthBlocked: "source is not healthy", schedulerRuntimeBlocked: "Scheduler runtime must remain disabled", schedulerRuntimeDetail: "Disable scheduler execution before a bounded production canary.", schedulesBlocked: "{count} schedule(s) are enabled", schedulesBlockedDetail: "Pause automatic schedules so canary work remains bounded.", argusBlocked: "Argus is not healthy and ready", argusBlockedDetail: "Review browser execution health and readiness.", failedJobsBlocker: "{count} failed queue job(s) require review", owner: "Owner", checked: "Checked", resolve: "Open remediation", ownerPlatform: "Platform operations", ownerCollection: "Collection operations", ownerOta: "OTA operations", otaEvidence: "OTA evidence window", otaEvidenceDetail: "Thirty-day durable evidence; empty or policy-blocked responses never count as positive coverage.", otaCounts: "Listings {listings} · rates {rates} · empty {empty} · policy {blocked} · challenge {challenge} · 429 {limited} · parser {parser} · latency {latency}", otaUnavailable: "OTA health unavailable", otaUnavailableDetail: "The Worker did not return an OTA health report." };
const zh: typeof en = { title: "生产就绪", description: "集中查看来源健康、计划任务、Argus、失败队列和有界 canary 门禁。", health: "运行健康", healthDetail: "当前健康的已启用来源", otaHealth: "OTA 证据健康", otaHealthDetail: "通过近期房源与价格正记录门槛的平台", schedules: "已启用计划", schedulerOn: "定时器运行时已开启", schedulerOff: "定时器运行时已关闭", ready: "就绪", blocked: "阻塞", queue: "失败队列历史", queueDetail: "可重试 {retry} · 外部阻塞 {external}", canary: "Canary 门禁", canaryDetail: "仅所有前置条件通过时才就绪", blockers: "发布阻塞项", blockersDetail: "执行生产 canary 前必须解决这里的所有项目。", noBlockers: "当前无阻塞项", noBlockersDetail: "可使用明确确认口令执行有界 canary。", boundary: "Canary 安全边界", boundaryDetail: "执行器遇到第一个不安全结果即停止，且不会启用计划任务。", mode: "模式", passes: "每来源轮数", stop: "停止条件", stopDetail: "配置、计划、解析、重复增长、远端证据", rollback: "回滚", rollbackDetail: "关闭计划并取消待执行采集任务", healthBlocked: "来源不健康", schedulerRuntimeBlocked: "定时器运行时必须关闭", schedulerRuntimeDetail: "执行有界生产 canary 前需要关闭定时器运行时。", schedulesBlocked: "有 {count} 个计划已启用", schedulesBlockedDetail: "暂停自动计划，确保 canary 采集范围可控。", argusBlocked: "Argus 未达到健康且就绪状态", argusBlockedDetail: "检查浏览器执行健康和就绪状态。", failedJobsBlocker: "有 {count} 个失败队列任务需要处理", owner: "负责人", checked: "检查时间", resolve: "打开整改入口", ownerPlatform: "平台运营", ownerCollection: "采集运营", ownerOta: "OTA 运营", otaEvidence: "OTA 证据窗口", otaEvidenceDetail: "最近 30 天的持久化证据；空结果或策略阻塞不能算作正覆盖。", otaCounts: "房源 {listings} · 价格 {rates} · 空结果 {empty} · 策略 {blocked} · challenge {challenge} · 429 {limited} · 解析 {parser} · 延迟 {latency}", otaUnavailable: "OTA 健康不可用", otaUnavailableDetail: "Worker 未返回 OTA 健康报告。" };
