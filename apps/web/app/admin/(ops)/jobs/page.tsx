import { prisma, type Prisma } from "@tymra/db";
import { jobTypes } from "@tymra/domain";
import Link from "next/link";

import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue } from "@/lib/admin-i18n";
import { adminListHref, adminListState } from "@/lib/admin-list";
import { getAdminLocale } from "@/lib/server/admin-locale";

export const dynamic = "force-dynamic";

export default async function ServiceJobsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const zh = locale === "zh";
  const title = zh ? "执行任务" : "Execution tasks";
  const { page, pageSize, skip } = adminListState(searchParams);
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const view = ["active", "failed", "all"].includes(searchParams.view ?? "") ? searchParams.view! : "active";
  const type = jobTypes.includes(searchParams.type as never) ? searchParams.type : undefined;
  const where: Prisma.JobWhereInput = {
    ...(view === "active" ? { status: { in: ["PENDING", "RUNNING"] } } : view === "failed" ? { status: { in: ["FAILED", "DEAD_LETTER"] } } : {}),
    ...(type ? { type: type as never } : {}),
    ...(q ? { OR: [{ id: { contains: q } }, { priceCheckId: { contains: q } }, { sourceId: { contains: q } }, { correlationId: { contains: q } }] } : {}),
  };
  const [total, jobs] = await Promise.all([
    prisma.job.count({ where }),
    prisma.job.findMany({ where, orderBy: view === "active" ? [{ priority: "asc" }, { createdAt: "asc" }] : { createdAt: "desc" }, skip, take: pageSize }),
  ]);
  const recoveryJobs = await prisma.job.findMany({ where: { correlationId: { in: jobs.map((job) => `service-recovery:${job.id}`) } }, select: { id: true, status: true, correlationId: true } });
  const recoveryByOriginal = new Map(recoveryJobs.map((job) => [job.correlationId, job]));
  return <section className="admin-page"><AdminPageHeader title={title} description={zh ? "查看执行阶段、失败历史和恢复任务；进入详情追溯原始请求及交付。" : "Inspect execution, failure history and recovery work. Open a task to trace its original request and delivery."} /><form className="admin-filters" method="get"><label>{zh ? "搜索" : "Search"}<input name="q" defaultValue={q} placeholder={zh ? "任务、请求、来源或关联编号" : "Task, request, source or correlation ID"} /></label><label>{zh ? "范围" : "View"}<select name="view" defaultValue={view}><option value="active">{zh ? "执行中与待执行" : "Active and pending"}</option><option value="failed">{zh ? "失败历史" : "Failure history"}</option><option value="all">{zh ? "全部任务" : "All tasks"}</option></select></label><label>{zh ? "阶段" : "Stage"}<select name="type" defaultValue={type ?? ""}><option value="">{zh ? "全部阶段" : "All stages"}</option>{jobTypes.map((value) => <option key={value} value={value}>{formatAdminValue(locale, value)}</option>)}</select></label><button className="button button-secondary">{zh ? "筛选" : "Apply"}</button></form><AdminListSummary locale={locale} total={total} tools={<AdminListTools locale={locale} viewName={title} />} /><AdminTable columns={[{ key: "task", label: zh ? "任务" : "Task" }, { key: "context", label: zh ? "服务上下文" : "Service context" }, { key: "status", label: zh ? "执行状态" : "Execution" }, { key: "recovery", label: zh ? "关联恢复" : "Linked recovery" }, { key: "attempts", label: zh ? "尝试" : "Attempts" }, { key: "created", label: zh ? "创建时间" : "Created" }]} rows={jobs.map((job) => {
    const recovery = recoveryByOriginal.get(`service-recovery:${job.id}`);
    return { id: job.id, href: `/admin/jobs/${job.id}`, cells: {
      task: <><strong>{formatAdminValue(locale, job.type)}</strong><small>{job.id}</small></>,
      context: <>{job.priceCheckId ? <Link href={`/admin/checks/${job.priceCheckId}`}>{job.priceCheckId}</Link> : "—"}<small>{job.sourceId ?? job.queueName}</small></>,
      status: <StatusPill value={job.status} locale={locale} />,
      recovery: recovery ? <Link href={`/admin/jobs/${recovery.id}`}><StatusPill value={recovery.status} locale={locale} /></Link> : "—",
      attempts: `${job.attemptCount} / ${job.maxAttempts}`,
      created: job.createdAt.toLocaleString(adminDateLocale(locale), { timeZone: "Pacific/Auckland" }),
    } };
  })} emptyTitle={zh ? "当前范围没有任务" : "No tasks in this view"} emptyBody={zh ? "调整筛选可查看其他任务或历史记录。" : "Adjust filters to inspect other work or history."} /><AdminPagination locale={locale} page={page} pageSize={pageSize} total={total} href={(next, size = pageSize) => adminListHref("/admin/jobs", searchParams, { page: next, pageSize: size })} /></section>;
}
