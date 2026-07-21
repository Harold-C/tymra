"use client";

import { CalendarClock, CirclePause, CirclePlay, LoaderCircle, Play, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";

type ScheduleView = { key: string; jobType: string; queueName: string; frequency: string; enabled: boolean; phase: string | null; nextRunAt: string | null; lastEnqueuedAt: string | null };
type SourceView = {
  key: string;
  name: string;
  enabled: boolean;
  operationalStatus: string;
  approvalStatus: string;
  rightsStatus: string;
  developmentAllowed: boolean;
  productionReady: boolean;
  lastSuccessAt: string | null;
  errorRate: number;
  schedules: ScheduleView[];
  activeJob: { id: string; status: string; workflow: string } | null;
  lastRun: { id: string; status: string; startedAt: string | null; finishedAt: string | null; successCount: number; failureCount: number; errorCode: string | null } | null;
};

export type CollectionControlView = {
  schedulerEnabled: boolean;
  nodeEnvironment: string;
  summary: { sources: number; enabledSources: number; pendingJobs: number; runningJobs: number; failedJobs: number };
  sources: SourceView[];
  jobs: Array<{ id: string; sourceKey: string; type: string; workflow: string; status: string; attemptCount: number; maxAttempts: number; runAt: string; createdAt: string; completedAt: string | null; lastErrorCode: string | null }>;
};

export function CollectionControlPanel({ locale, view }: { locale: AdminLocale; view: CollectionControlView }) {
  const text = copy(locale);
  const router = useRouter();
  const defaults = useMemo(() => Object.fromEntries(view.sources.map((source) => [source.key, source.schedules[0]?.key ?? ""])), [view.sources]);
  const [workflows, setWorkflows] = useState<Record<string, string>>(defaults);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  async function act(key: string, body: Record<string, unknown>, confirmation?: string) {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(key);
    setNotice(null);
    try {
      const response = await fetch("/api/v1/admin/collection-control", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message ?? text.actionFailed);
      setNotice({ tone: "success", message: text.actionCompleted });
      router.refresh();
    } catch (error) {
      setNotice({ tone: "error", message: error instanceof Error ? error.message : text.actionFailed });
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="admin-page collection-control-page">
      <header className="admin-page-header"><div><h1>{text.title}</h1><p>{text.description}</p></div><Link className="admin-secondary-action" href="/admin/collection-runs">{text.viewRuns}</Link></header>
      <div className={`collection-runtime ${view.schedulerEnabled ? "runtime-enabled" : "runtime-disabled"}`}>
        <CalendarClock size={20} aria-hidden="true" />
        <div><strong>{view.schedulerEnabled ? text.schedulerOn : text.schedulerOff}</strong><span>{view.schedulerEnabled ? text.schedulerOnBody : text.schedulerOffBody}</span></div>
        <code>{view.nodeEnvironment}</code>
      </div>
      <dl className="collection-summary">
        <div><dt>{text.sources}</dt><dd>{view.summary.enabledSources}<span> / {view.summary.sources}</span></dd></div>
        <div><dt>{text.pending}</dt><dd>{view.summary.pendingJobs}</dd></div>
        <div><dt>{text.running}</dt><dd>{view.summary.runningJobs}</dd></div>
        <div><dt>{text.failed}</dt><dd>{view.summary.failedJobs}</dd></div>
      </dl>
      {notice ? <p className={`collection-notice ${notice.tone}`} role="status">{notice.message}</p> : null}

      <section className="collection-section" aria-labelledby="collection-sources-title">
        <div className="collection-section-header"><div><h2 id="collection-sources-title">{text.sourceControl}</h2><p>{text.sourceControlBody}</p></div></div>
        <div className="admin-table-wrap" tabIndex={0}><table className="admin-table collection-control-table"><thead><tr><th>{text.source}</th><th>{text.readiness}</th><th>{text.latestRun}</th><th>{text.workflow}</th><th>{text.actions}</th></tr></thead><tbody>
          {view.sources.map((source) => {
            const workflow = workflows[source.key] || source.schedules[0]?.key || "";
            const canRun = source.enabled && source.schedules.length > 0 && !source.activeJob && (source.productionReady || (view.nodeEnvironment === "development" && source.developmentAllowed && !view.schedulerEnabled));
            return <tr key={source.key}>
              <td><strong>{source.name}</strong><code>{source.key}</code><span className="table-secondary">{text.lastSuccess}: {date(source.lastSuccessAt, locale)}</span></td>
              <td><div className="collection-status-stack"><Status value={source.enabled ? "ENABLED" : "PAUSED"} locale={locale} /><Status value={source.operationalStatus} locale={locale} /><span className="table-secondary">{source.productionReady ? text.productionReady : view.nodeEnvironment === "development" && source.developmentAllowed ? text.developmentBounded : text.governanceBlocked}</span></div></td>
              <td>{source.activeJob ? <><Status value={source.activeJob.status} locale={locale} /><code>{source.activeJob.workflow}</code></> : source.lastRun ? <><Status value={source.lastRun.status} locale={locale} /><span className="table-secondary">{date(source.lastRun.finishedAt ?? source.lastRun.startedAt, locale)} · {source.lastRun.successCount}/{source.lastRun.failureCount}</span>{source.lastRun.errorCode ? <code>{source.lastRun.errorCode}</code> : null}</> : <span className="table-secondary">{text.neverRun}</span>}</td>
              <td><select aria-label={`${source.name} ${text.workflow}`} value={workflow} onChange={(event) => setWorkflows((current) => ({ ...current, [source.key]: event.target.value }))}>{source.schedules.map((schedule) => <option key={schedule.key} value={schedule.key}>{workflowName(schedule, locale)} · {frequency(schedule.frequency, locale)}</option>)}</select></td>
              <td><div className="collection-row-actions"><button className="button button-secondary" type="button" disabled={!canRun || busy !== ""} title={!canRun && source.activeJob ? text.alreadyActive : text.runNow} onClick={() => void act(`run:${source.key}`, { action: "enqueue", scheduleKey: workflow })}>{busy === `run:${source.key}` ? <LoaderCircle className="spin" size={16} /> : <Play size={16} />}{text.runNow}</button><button className="icon-action" type="button" disabled={busy !== ""} title={source.enabled ? text.pauseSource : text.resumeSource} aria-label={`${source.enabled ? text.pauseSource : text.resumeSource} ${source.name}`} onClick={() => void act(`source:${source.key}`, { action: "set_source_enabled", sourceKey: source.key, enabled: !source.enabled }, source.enabled ? text.pauseConfirmation : undefined)}>{busy === `source:${source.key}` ? <LoaderCircle className="spin" size={17} /> : source.enabled ? <CirclePause size={18} /> : <CirclePlay size={18} />}</button></div></td>
            </tr>;
          })}
        </tbody></table></div>
      </section>

      <section className="collection-section" aria-labelledby="collection-schedules-title">
        <div className="collection-section-header"><div><h2 id="collection-schedules-title">{text.schedules}</h2><p>{view.schedulerEnabled ? text.schedulesBody : text.schedulesLocked}</p></div></div>
        <div className="admin-table-wrap" tabIndex={0}><table className="admin-table"><thead><tr><th>{text.workflow}</th><th>{text.source}</th><th>{text.frequency}</th><th>{text.lastQueued}</th><th>{text.nextRun}</th><th>{text.status}</th></tr></thead><tbody>
          {view.sources.flatMap((source) => source.schedules.map((schedule) => <tr key={schedule.key}><td><strong>{workflowName(schedule, locale)}</strong><code>{schedule.key}</code></td><td>{source.name}</td><td>{frequency(schedule.frequency, locale)}</td><td>{date(schedule.lastEnqueuedAt, locale)}</td><td>{date(schedule.nextRunAt, locale)}</td><td><button className="button button-secondary" type="button" disabled={!view.schedulerEnabled || busy !== ""} onClick={() => void act(`schedule:${schedule.key}`, { action: "set_schedule_enabled", scheduleKey: schedule.key, enabled: !schedule.enabled })}>{busy === `schedule:${schedule.key}` ? <LoaderCircle className="spin" size={16} /> : schedule.enabled ? <CirclePause size={16} /> : <CirclePlay size={16} />}{schedule.enabled ? text.disable : text.enable}</button></td></tr>))}
        </tbody></table></div>
      </section>

      <section className="collection-section" aria-labelledby="collection-queue-title">
        <div className="collection-section-header"><div><h2 id="collection-queue-title">{text.recentJobs}</h2><p>{text.recentJobsBody}</p></div></div>
        {view.jobs.length ? <div className="admin-table-wrap" tabIndex={0}><table className="admin-table"><thead><tr><th>{text.job}</th><th>{text.source}</th><th>{text.workflow}</th><th>{text.status}</th><th>{text.attempts}</th><th>{text.queued}</th><th>{text.actions}</th></tr></thead><tbody>{view.jobs.map((job) => <tr key={job.id}><td><code>{job.id}</code></td><td>{job.sourceKey}</td><td>{workflowText(job.workflow, locale)}</td><td><Status value={job.status} locale={locale} />{job.lastErrorCode ? <code>{job.lastErrorCode}</code> : null}</td><td>{job.attemptCount} / {job.maxAttempts}</td><td>{date(job.createdAt, locale)}</td><td>{job.status === "PENDING" ? <button className="icon-action danger" type="button" disabled={busy !== ""} title={text.cancelJob} aria-label={`${text.cancelJob} ${job.id}`} onClick={() => void act(`job:${job.id}`, { action: "cancel_job", jobId: job.id }, text.cancelConfirmation)}>{busy === `job:${job.id}` ? <LoaderCircle className="spin" size={17} /> : <XCircle size={18} />}</button> : <span className="table-secondary">—</span>}</td></tr>)}</tbody></table></div> : <div className="admin-empty compact"><h3>{text.noJobs}</h3><p>{text.noJobsBody}</p></div>}
      </section>
    </section>
  );
}

function Status({ value, locale }: { value: string; locale: AdminLocale }) { return <span className={`status-pill pill-${value.toLowerCase().replaceAll("_", "-")}`}>{formatAdminValue(locale, value)}</span>; }
function date(value: string | null, locale: AdminLocale) { return value ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—"; }
function workflowName(schedule: ScheduleView, locale: AdminLocale) { return schedule.phase ? workflowText(schedule.phase, locale) : workflowText(schedule.jobType, locale); }
function workflowText(value: string, locale: AdminLocale) {
  const normalized = value.includes(":") ? value.split(":").at(-1) ?? value : value;
  const translations: Record<string, [string, string]> = { discovery: ["Discovery", "发现"], details: ["Details", "详情"], full: ["Full collection", "完整采集"], PUBLIC_DATA_COLLECTION: ["Public data", "公开数据"], EVENT_COLLECTION: ["Event collection", "事件采集"], WEATHER_COLLECTION: ["Weather collection", "天气采集"], TRANSPORT_COLLECTION: ["Transport collection", "交通采集"] };
  return translations[normalized]?.[locale === "zh" ? 1 : 0] ?? normalized.replaceAll("-", " ").replaceAll("_", " ");
}
function frequency(value: string, locale: AdminLocale) {
  if (locale === "en") return value.replaceAll("-", " ");
  if (value === "daily") return "每天";
  if (value === "weekly") return "每周";
  const match = value.match(/^every-(\d+)-(minutes|hours)$/);
  if (!match) return value;
  return `每 ${match[1]} ${match[2] === "hours" ? "小时" : "分钟"}`;
}

function copy(locale: AdminLocale) { return locale === "zh" ? zh : en; }
const en = {
  title: "Schedules & queue", description: "Run sources manually, govern persisted schedules and inspect queued collection work.", viewRuns: "View collection runs", schedulerOn: "Scheduler runtime enabled", schedulerOnBody: "Enabled schedule definitions can enqueue work at their configured frequency.", schedulerOff: "Scheduler runtime disabled", schedulerOffBody: "No scheduled work will be enqueued. Safe manual runs remain available.", sources: "Sources enabled", pending: "Pending", running: "Running", failed: "Failed / dead letter", sourceControl: "Source control", sourceControlBody: "Manual runs use bounded development settings and reject duplicate work during cooldown.", source: "Source", readiness: "Readiness", latestRun: "Latest run", workflow: "Workflow", actions: "Actions", lastSuccess: "Last success", productionReady: "Production governance ready", developmentBounded: "Bounded development run", governanceBlocked: "Governance blocked", neverRun: "No collection run", alreadyActive: "A job is already active", runNow: "Run now", pauseSource: "Pause source", resumeSource: "Resume source", pauseConfirmation: "Pause this source? Pending collection jobs and its enabled schedules will be cancelled.", schedules: "Schedules", schedulesBody: "Control persisted schedule definitions. Runtime configuration remains the final gate.", schedulesLocked: "Read-only while the global scheduler is disabled. This keeps development free of scheduled collection.", frequency: "Frequency", lastQueued: "Last queued", nextRun: "Next run", status: "Status", enable: "Enable", disable: "Disable", recentJobs: "Recent collection jobs", recentJobsBody: "Only pending jobs can be cancelled; running jobs finish under their existing lease.", job: "Job", attempts: "Attempts", queued: "Queued", cancelJob: "Cancel pending job", cancelConfirmation: "Cancel this pending collection job?", noJobs: "No queued collection jobs", noJobsBody: "Manual and scheduled jobs will appear here after they are enqueued.", actionCompleted: "Collection control updated.", actionFailed: "The collection control action failed.",
};
const zh: typeof en = {
  title: "计划与队列", description: "手动运行来源、管理持久化计划，并检查采集队列中的工作。", viewRuns: "查看采集运行", schedulerOn: "定时采集运行中", schedulerOnBody: "已启用的计划会按照配置频率自动加入队列。", schedulerOff: "定时采集已关闭", schedulerOffBody: "系统不会自动加入计划任务，但仍可执行有边界的手动采集。", sources: "已启用来源", pending: "等待执行", running: "正在运行", failed: "失败 / 死信", sourceControl: "来源控制", sourceControlBody: "手动采集使用开发环境安全边界，并在冷却期内拒绝重复任务。", source: "数据来源", readiness: "可用状态", latestRun: "最近运行", workflow: "采集流程", actions: "操作", lastSuccess: "最近成功", productionReady: "生产治理已就绪", developmentBounded: "开发环境受限采集", governanceBlocked: "治理条件未满足", neverRun: "尚无采集运行", alreadyActive: "已有任务正在等待或执行", runNow: "立即运行", pauseSource: "暂停来源", resumeSource: "恢复来源", pauseConfirmation: "确定暂停此来源吗？其等待执行的采集任务和已启用计划将被取消。", schedules: "定时计划", schedulesBody: "控制持久化计划定义，运行环境配置仍是最终开关。", schedulesLocked: "全局定时器关闭时保持只读，确保开发环境不会自动采集。", frequency: "频率", lastQueued: "最近入队", nextRun: "下次运行", status: "状态", enable: "启用", disable: "停用", recentJobs: "最近采集任务", recentJobsBody: "只能取消等待执行的任务；正在运行的任务会在现有租约内完成。", job: "任务", attempts: "尝试次数", queued: "入队时间", cancelJob: "取消等待任务", cancelConfirmation: "确定取消这个等待执行的采集任务吗？", noJobs: "暂无采集队列任务", noJobsBody: "手动或定时任务加入队列后会显示在这里。", actionCompleted: "采集控制已更新。", actionFailed: "采集控制操作失败。",
};
