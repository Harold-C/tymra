import { prisma } from "@tymra/db";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminTable, StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function DataLineagePage() {
  const locale = getAdminLocale();
  const zh = locale === "zh";
  const runs = await prisma.transformationRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 100,
    include: { dataSource: { select: { key: true } }, collectionRun: { select: { id: true } }, lineageEdges: { take: 10, orderBy: { createdAt: "asc" } } },
  });
  return (
    <section className="admin-page">
      <AdminPageHeader title={zh ? "数据血缘" : "Data lineage"} description={zh ? "从来源和采集批次追踪标准化事实、快照与结果。" : "Trace normalized facts, snapshots and results back to sources and collection runs."} />
      <AdminTable
        columns={[
          { key: "type", label: zh ? "转换" : "Transformation" },
          { key: "source", label: zh ? "来源／采集" : "Source / collection" },
          { key: "status", label: zh ? "状态" : "Status" },
          { key: "edges", label: zh ? "输入 → 输出" : "Inputs → outputs" },
          { key: "started", label: zh ? "开始" : "Started" },
        ]}
        rows={runs.map((run) => ({
          id: run.id,
          cells: {
            type: <><strong>{run.transformationType}</strong><small>{run.transformationVersion}</small></>,
            source: <><span>{run.dataSource?.key ?? "—"}</span><small>{run.collectionRun?.id ?? "—"}</small></>,
            status: <StatusPill value={run.status} locale={locale} />,
            edges: run.lineageEdges.length ? run.lineageEdges.map((edge) => `${edge.inputType}:${edge.inputId} → ${edge.outputType}:${edge.outputId}`).join(" · ") : "—",
            started: run.startedAt.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }),
          },
        }))}
        emptyTitle={zh ? "暂无转换记录" : "No transformation runs"}
        emptyBody={zh ? "完成标准化、快照或结果转换后会显示在这里。" : "Completed normalization, snapshot and result transformations appear here."}
      />
    </section>
  );
}
