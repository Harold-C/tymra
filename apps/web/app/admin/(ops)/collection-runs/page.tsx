import { prisma, type CollectionStatus, type ExceptionStatus, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, type AdminLocale } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";

const runStatuses: CollectionStatus[] = ["PENDING", "RUNNING", "SUCCEEDED", "PARTIAL", "FAILED", "CANCELLED"];
const incidentStatuses: ExceptionStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];

export default async function CollectionRunsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const text = copy(locale);
  const status = runStatuses.includes(searchParams.status as CollectionStatus) ? searchParams.status as CollectionStatus : undefined;
  const incidentStatus = incidentStatuses.includes(searchParams.incident as ExceptionStatus) ? searchParams.incident as ExceptionStatus : undefined;
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const { page, pageSize, skip } = adminListState(searchParams);
  const sourceScope: Prisma.DataSourceWhereInput = { isDemo: false };
  const sources = await prisma.dataSource.findMany({ where: sourceScope, orderBy: { name: "asc" }, select: { key: true, name: true } });
  const selectedSource = sources.find((source) => source.key === searchParams.source)?.key;
  const where: Prisma.CollectionRunWhereInput = {
    isDemo: false,
    dataSource: { ...sourceScope, ...(selectedSource ? { key: selectedSource } : {}) },
    ...(status ? { status } : {}),
    ...(incidentStatus ? { incident: { status: incidentStatus } } : {}),
    ...(q ? { OR: [{ id: { contains: q, mode: "insensitive" as const } }, { errorCode: { contains: q, mode: "insensitive" as const } }, { dataSource: { name: { contains: q, mode: "insensitive" as const } } }] } : {}),
  };
  const [total, runs, openIncidentCount, running, failedDay] = await Promise.all([
    prisma.collectionRun.count({ where }),
    prisma.collectionRun.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { dataSource: { select: { name: true, key: true } }, incident: true, job: { select: { id: true, status: true, attemptCount: true, maxAttempts: true } } } }),
    prisma.collectionIncident.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false, collectionRun: { dataSource: sourceScope } } }),
    prisma.collectionRun.count({ where: { isDemo: false, status: "RUNNING", dataSource: sourceScope } }),
    prisma.collectionRun.count({ where: { isDemo: false, status: { in: ["FAILED", "PARTIAL"] }, createdAt: { gte: new Date(Date.now() - 86_400_000) }, dataSource: sourceScope } }),
  ]);
  const rows = runs.map((run) => ({
    id: run.id,
    href: `/admin/collection-runs/${run.id}`,
    cells: {
      run: <><strong>{date(run.startedAt ?? run.createdAt, locale)}</strong><small>{run.id}{run.incident ? ` · ${run.incident.category}` : ""}</small></>,
      source: <>{run.dataSource.name}<small>{run.dataSource.key}</small></>,
      mode: run.mode,
      status: <StatusPill value={run.status} locale={locale} />,
      incident: run.incident ? <><StatusPill value={run.incident.severity} locale={locale} /> <StatusPill value={run.incident.status} locale={locale} /></> : "—",
      records: `${run.successCount} / ${run.failureCount}`,
      job: run.job ? <>{run.job.status}<small>{run.job.attemptCount} / {run.job.maxAttempts}</small></> : "—",
      started: date(run.startedAt ?? run.createdAt, locale),
    },
  }));
  return <section className="admin-page collection-runs-page">
    <AdminPageHeader title={text.title} description={text.description} actions={<div className="header-pills"><Link className="button button-secondary" href="/admin/exceptions?kind=collection">{text.incidentInbox}</Link><Link className="button button-secondary" href="/admin/collection-control">{text.control}</Link></div>} />
    <dl className="collection-summary"><div><dt>{text.total}</dt><dd>{total}</dd></div><div><dt>{text.openIncidents}</dt><dd>{openIncidentCount}</dd></div><div><dt>{text.running}</dt><dd>{running}</dd></div><div><dt>{text.failedDay}</dt><dd>{failedDay}</dd></div></dl>
    <form className="admin-filters" method="get"><label>{text.status}<select name="status" defaultValue={status ?? ""}><option value="">{text.allStatuses}</option>{runStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label>{text.incident}<select name="incident" defaultValue={incidentStatus ?? ""}><option value="">{text.allIncidents}</option>{incidentStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label>{text.source}<select name="source" defaultValue={selectedSource ?? ""}><option value="">{text.allSources}</option>{sources.map((source) => <option key={source.key} value={source.key}>{source.name}</option>)}</select></label><label>{text.search}<input name="q" defaultValue={q} placeholder={text.searchPlaceholder} /></label><button className="button button-secondary" type="submit">{text.apply}</button></form>
    <div className="data-explorer-result-meta"><strong>{text.results}</strong><span>{text.resultCount.replace("{count}", total.toLocaleString())}</span></div><AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={text.title} />} />
    <AdminTable columns={[{ key: "run", label: text.run }, { key: "source", label: text.source }, { key: "mode", label: text.mode }, { key: "status", label: text.status }, { key: "incident", label: text.incident }, { key: "records", label: text.records }, { key: "job", label: text.job }, { key: "started", label: text.started }]} rows={rows} emptyTitle={text.empty} emptyBody={text.emptyBody} />
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={(next, size = pageSize) => adminListHref("/admin/collection-runs", searchParams, { page: Math.max(1, next), pageSize: size })} />
  </section>;
}

function date(value: Date | null, locale: AdminLocale) { return value ? value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—"; }
function copy(locale: AdminLocale) { return locale === "zh" ? zh : en; }
const en = { title: "Collection Runs", description: "Search execution history and inspect evidence, output and configuration for each run.", control: "Schedules & queue", incidentInbox: "Collection incidents", total: "Matching runs", openIncidents: "Open incidents", running: "Running", failedDay: "Failed / partial 24h", status: "Run status", allStatuses: "All statuses", incident: "Incident", allIncidents: "All incident states", source: "Source", allSources: "All sources", search: "Search", searchPlaceholder: "Run ID, source or error code", apply: "Apply", results: "Collection history", resultCount: "{count} runs", run: "Collection run", mode: "Mode", records: "Success / failure", job: "Job", started: "Started", empty: "No collection runs", emptyBody: "No runs match these filters.", pagination: "Collection run pages", previous: "Previous", next: "Next", page: "Page {page} of {total}" };
const zh: typeof en = { title: "采集运行", description: "检索采集执行历史，并查看每次运行的证据、产出和配置。", control: "计划与队列", incidentInbox: "采集异常", total: "匹配运行", openIncidents: "未关闭异常", running: "正在运行", failedDay: "24 小时失败 / 部分成功", status: "运行状态", allStatuses: "全部状态", incident: "异常", allIncidents: "全部异常状态", source: "数据来源", allSources: "全部来源", search: "搜索", searchPlaceholder: "运行 ID、来源或错误码", apply: "应用筛选", results: "采集历史", resultCount: "共 {count} 次运行", run: "采集运行", mode: "模式", records: "成功 / 失败", job: "任务", started: "开始时间", empty: "暂无采集运行", emptyBody: "没有符合当前筛选条件的运行。", pagination: "采集运行分页", previous: "上一页", next: "下一页", page: "第 {page} / {total} 页" };
