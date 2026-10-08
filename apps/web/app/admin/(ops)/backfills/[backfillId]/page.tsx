import { prisma } from "@tymra/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { ServiceRecoveryAction } from "@/components/admin/ServiceRecoveryAction";
import { AdminPagination } from "@/components/admin/AdminTable";
import { adminListHref, adminListState } from "@/lib/admin-list";

export default async function Page({ params, searchParams }: { params: { backfillId: string }; searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale(), zh = locale === "zh";
  const { page, pageSize, skip } = adminListState(searchParams);
  const plan = await prisma.serviceBackfill.findUnique({ where: { id: params.backfillId }, include: { rows: { orderBy: { rowNumber: "asc" }, skip, take: pageSize } } });
  if (!plan) notFound();
  const [source, job, groups] = await Promise.all([
    prisma.dataSource.findUniqueOrThrow({ where: { id: plan.dataSourceId } }),
    plan.jobId ? prisma.job.findUnique({ where: { id: plan.jobId } }) : null,
    prisma.serviceBackfillRow.groupBy({ where: { backfillId: plan.id }, by: ["status"], _count: { _all: true } }),
  ]);
  const retryable = job && ["FAILED", "DEAD_LETTER"].includes(job.status) && groups.some(row => ["PENDING", "FAILED"].includes(row.status));
  return <section className="admin-page">
    <header className="admin-page-header"><div><h1>{source.name} · {zh ? "回填" : "Backfill"}</h1><p>{plan.id} · {plan.status}</p></div></header>
    <p>{plan.rangeFrom.toISOString()} → {plan.rangeTo.toISOString()} · {plan.reason}</p><p className="code-value">SHA-256: {plan.checksum}</p>
    <p><a href={plan.evidenceReference} rel="noreferrer">{zh ? "来源依据" : "Source evidence"}</a> · {job ? <Link href={`/admin/jobs/${job.id}`}>{zh ? "当前任务" : "Current job"} · {job.status}</Link> : null} · {plan.collectionRunId ? <Link href={`/admin/collection-runs/${plan.collectionRunId}`}>{zh ? "处理运行与血缘" : "Processing run and lineage"}</Link> : null}</p>
    <p>{zh ? "记录保留原观测日期；来源材料由提交者核验，此操作不宣称已重新抓取原页面。刷新页面查看持久处理进度。" : "Original observation dates are retained. Source material is attested by the submitter; this does not claim a fresh capture of the page. Refresh to inspect persisted progress."}</p>
    <p>{groups.map(row => `${row.status}: ${row._count._all}`).join(" · ")}</p>
    {retryable ? <ServiceRecoveryAction locale={locale} endpoint={`/api/v1/admin/backfills/${plan.id}/actions`} label={zh ? "恢复未完成行" : "Recover unfinished rows"} /> : null}
    {plan.status === "QUEUED" && job?.status === "PENDING" ? <ServiceRecoveryAction locale={locale} endpoint={`/api/v1/admin/backfills/${plan.id}/actions`} action="CANCEL" label={zh ? "取消尚未开始的回填" : "Cancel pending backfill"} completedMessage={zh ? "回填已取消，原始审阅记录保留。" : "Backfill cancelled; reviewed input is retained."} /> : null}
    <div className="admin-table-wrap"><table><thead><tr><th>#</th><th>{zh ? "状态" : "Status"}</th><th>{zh ? "事实版本" : "Fact version"}</th><th>{zh ? "错误与次数" : "Error and attempts"}</th></tr></thead><tbody>{plan.rows.map(row => <tr key={row.id}><td>{row.rowNumber}</td><td>{row.status}</td><td>{row.factVersionId ? <Link href={`/admin/data-explorer?layer=source&dataset=history&q=${row.factVersionId}`}>{row.factVersionId}</Link> : "—"}</td><td>{row.errorCode ?? "—"} · {row.attemptCount}</td></tr>)}</tbody></table></div>
    <AdminPagination locale={locale} page={page} pageSize={pageSize} total={plan.totalRows} href={(next, size = pageSize) => adminListHref(`/admin/backfills/${plan.id}`, searchParams, { page: next, pageSize: size })} />
  </section>;
}
