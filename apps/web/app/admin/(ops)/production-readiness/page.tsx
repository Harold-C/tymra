import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { AlertTriangle, CheckCircle2, CircleX, ShieldCheck } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { getAdminLocale } from "@/lib/server/admin-locale";

export const dynamic = "force-dynamic";

export default async function ProductionReadinessPage() {
  const locale = getAdminLocale();
  const t = locale === "zh" ? zh : en;
  const environment = getEnvironment();
  const [sources, enabledSchedules, failedJobs, argus] = await Promise.all([
    prisma.dataSource.findMany({ where: { providerType: "PUBLIC", isDemo: false }, orderBy: { key: "asc" }, select: { key: true, name: true, enabled: true, operationalStatus: true } }),
    prisma.scheduleDefinition.count({ where: { enabled: true } }),
    prisma.job.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, select: { id: true, type: true, status: true, lastErrorCode: true }, orderBy: { createdAt: "asc" }, take: 500 }),
    loadArgusHealth(),
  ]);
  const candidates = sources.filter((source) => source.enabled);
  const external = failedJobs.filter((job) => /SOURCE_UNAVAILABLE|RATE_LIMITED|ACCESS_CHALLENGE/.test(job.lastErrorCode ?? "")).length;
  const retryable = failedJobs.filter((job) => job.status === "FAILED" && !/SOURCE_UNAVAILABLE|RATE_LIMITED|ACCESS_CHALLENGE/.test(job.lastErrorCode ?? "") && /TIMEOUT|NETWORK|LEASE|UNAVAILABLE/.test(job.lastErrorCode ?? "")).length;
  const sourceBlockers = candidates.flatMap((source) => {
    const reasons = [
      ...(source.operationalStatus !== "HEALTHY" ? [t.healthBlocked] : []),
    ];
    return reasons.length ? [`${source.key}: ${reasons.join(" · ")}`] : [];
  });
  const blockers = [
    ...(environment.NODE_ENV !== "development" && environment.SCHEDULER_ENABLED ? [t.schedulerRuntimeBlocked] : []),
    ...(enabledSchedules ? [t.schedulesBlocked.replace("{count}", String(enabledSchedules))] : []),
    ...(!argus.healthy || !argus.ready ? [t.argusBlocked] : []),
    ...sourceBlockers,
  ];
  const cards = [
    { label: t.health, value: `${candidates.filter((source) => source.operationalStatus === "HEALTHY").length} / ${candidates.length}`, ok: candidates.every((source) => source.operationalStatus === "HEALTHY"), detail: t.healthDetail },
    { label: t.schedules, value: String(enabledSchedules), ok: enabledSchedules === 0 && (environment.NODE_ENV === "development" || !environment.SCHEDULER_ENABLED), detail: environment.NODE_ENV !== "development" && environment.SCHEDULER_ENABLED ? t.schedulerOn : t.schedulerOff },
    { label: "Argus", value: argus.healthy && argus.ready ? t.ready : t.blocked, ok: argus.healthy && argus.ready, detail: argus.message ?? `${argus.latencyMs ?? 0} ms` },
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
        {blockers.length ? <ul className="run-diagnostics has-danger">{blockers.map((blocker) => <li className="danger" key={blocker}><CircleX size={16} /><span>{blocker}</span></li>)}</ul> : <div className="admin-empty compact"><CheckCircle2 size={24} /><h3>{t.noBlockers}</h3><p>{t.noBlockersDetail}</p></div>}
      </section>
      <aside className="overview-section">
        <header><div><h2>{t.boundary}</h2><p>{t.boundaryDetail}</p></div></header>
        <dl className="detail-list"><div><dt>{t.mode}</dt><dd>READ_ONLY_BOUNDED</dd></div><div><dt>{t.passes}</dt><dd>2</dd></div><div><dt>{t.stop}</dt><dd>{t.stopDetail}</dd></div><div><dt>{t.rollback}</dt><dd>{t.rollbackDetail}</dd></div></dl>
      </aside>
    </div>
  </section>;
}

type ArgusHealth = { healthy: boolean; ready: boolean; latencyMs?: number; message?: string };
async function loadArgusHealth(): Promise<ArgusHealth> {
  try {
    const response = await fetch(`${process.env.WORKER_INTERNAL_URL ?? "http://tymra-worker-api:3100"}/worker/health`, { cache: "no-store", signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const health = await response.json() as { argus: ArgusHealth };
    return health.argus;
  } catch (error) { return { healthy: false, ready: false, message: error instanceof Error ? error.message : "Unavailable" }; }
}

const en = { title: "Production readiness", description: "One fail-closed view of source health, schedules, Argus, queue history and the bounded canary gate.", health: "Operational health", healthDetail: "Enabled sources currently healthy", schedules: "Enabled schedules", schedulerOn: "Scheduler runtime is on", schedulerOff: "Scheduler runtime is off", ready: "READY", blocked: "BLOCKED", queue: "Failed queue history", queueDetail: "{retry} retry eligible · {external} externally blocked", canary: "Canary gate", canaryDetail: "Ready only when every prerequisite is green", blockers: "Release blockers", blockersDetail: "Every item here must be resolved before running a production canary.", noBlockers: "No current blocker", noBlockersDetail: "The bounded canary may be run with its explicit confirmation token.", boundary: "Canary safety boundary", boundaryDetail: "The runner stops on the first unsafe result and never enables schedules.", mode: "Mode", passes: "Passes per source", stop: "Stop conditions", stopDetail: "configuration, schedule, parser, repeat growth, remote evidence", rollback: "Rollback", rollbackDetail: "Disable schedules and cancel pending collection work", healthBlocked: "source is not healthy", schedulerRuntimeBlocked: "Scheduler runtime must remain disabled", schedulesBlocked: "{count} schedule(s) are enabled", argusBlocked: "Argus is not healthy and ready" };
const zh: typeof en = { title: "生产就绪", description: "集中查看来源健康、计划任务、Argus、失败队列和有界 canary 门禁。", health: "运行健康", healthDetail: "当前健康的已启用来源", schedules: "已启用计划", schedulerOn: "定时器运行时已开启", schedulerOff: "定时器运行时已关闭", ready: "就绪", blocked: "阻塞", queue: "失败队列历史", queueDetail: "可重试 {retry} · 外部阻塞 {external}", canary: "Canary 门禁", canaryDetail: "仅所有前置条件通过时才就绪", blockers: "发布阻塞项", blockersDetail: "执行生产 canary 前必须解决这里的所有项目。", noBlockers: "当前无阻塞项", noBlockersDetail: "可使用明确确认口令执行有界 canary。", boundary: "Canary 安全边界", boundaryDetail: "执行器遇到第一个不安全结果即停止，且不会启用计划任务。", mode: "模式", passes: "每来源轮数", stop: "停止条件", stopDetail: "配置、计划、解析、重复增长、远端证据", rollback: "回滚", rollbackDetail: "关闭计划并取消待执行采集任务", healthBlocked: "来源不健康", schedulerRuntimeBlocked: "定时器运行时必须关闭", schedulesBlocked: "有 {count} 个计划已启用", argusBlocked: "Argus 未达到健康且就绪状态" };
