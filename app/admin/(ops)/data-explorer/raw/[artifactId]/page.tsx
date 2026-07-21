import { prisma } from "@tymra/db";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { canReadArtifactContent } from "@/lib/server/raw-artifact-content";

export default async function RawArtifactDetailPage({ params }: { params: { artifactId: string } }) {
  const locale = getAdminLocale();
  const text = copy(locale);
  const artifact = await prisma.rawArtifact.findUnique({ where: { id: params.artifactId } });
  if (!artifact) notFound();
  const source = await prisma.dataSource.findFirst({
    where: { id: artifact.dataSourceId, providerType: { in: ["PUBLIC", "MANUAL"] }, sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] }, isDemo: false },
    select: { name: true, key: true },
  });
  if (!source) notFound();
  const [run, sourceOccurrences, sourceSignals, rates] = await Promise.all([
    prisma.collectionRun.findUnique({ where: { id: artifact.collectionRunId }, select: { id: true, status: true, mode: true, startedAt: true, finishedAt: true, errorCode: true, errorSummary: true } }),
    prisma.sourceEventOccurrence.findMany({ where: { lastCollectionRunId: artifact.collectionRunId }, orderBy: { lastSeenAt: "desc" }, take: 10, select: { id: true, title: true, externalId: true, status: true } }),
    prisma.sourceMarketSignal.findMany({ where: { lastCollectionRunId: artifact.collectionRunId }, orderBy: { lastSeenAt: "desc" }, take: 10, select: { id: true, title: true, externalId: true, direction: true } }),
    prisma.rateObservation.findMany({ where: { collectionRunId: artifact.collectionRunId }, orderBy: { collectedAt: "desc" }, take: 10, include: { property: { select: { canonicalName: true } }, sellableUnit: { select: { officialName: true } } } }),
  ]);
  const contentAvailable = canReadArtifactContent(artifact);
  const contentUrl = `/api/v1/admin/data-explorer/raw/${artifact.id}/content`;
  const screenshot = contentAvailable && artifact.artifactType.includes("SCREENSHOT");
  const payloadVisible = !artifact.containsSensitiveData && !artifact.deletedAt && artifact.payload !== null;

  return (
    <section className="admin-page raw-artifact-detail">
      <AdminPageHeader title={text.title} description={artifact.id} actions={<Link className="button button-secondary" href="/admin/data-explorer?layer=raw&dataset=artifacts">{text.back}</Link>} />
      <div className="detail-sections">
        <section>
          <h2>{text.metadata}</h2>
          <dl className="detail-list">
            <div><dt>{text.source}</dt><dd>{source.name}<small>{source.key}</small></dd></div>
            <div><dt>{text.type}</dt><dd>{artifact.artifactType}</dd></div>
            <div><dt>{text.run}</dt><dd><Link href={`/admin/collection-runs/${artifact.collectionRunId}`}>{artifact.collectionRunId}</Link></dd></div>
            <div><dt>{text.storage}</dt><dd>{artifact.storageRef}</dd></div>
            <div><dt>{text.hash}</dt><dd className="code-value">{artifact.contentHash}</dd></div>
            <div><dt>{text.parser}</dt><dd><StatusPill locale={locale} value={artifact.parserFailure ? "FAILED" : "SUCCEEDED"} /></dd></div>
            <div><dt>{text.sensitivity}</dt><dd><StatusPill locale={locale} value={artifact.containsSensitiveData ? "BLOCKED" : "AVAILABLE"} /></dd></div>
            <div><dt>{text.created}</dt><dd>{date(artifact.createdAt, locale)}</dd></div>
            <div><dt>{text.expires}</dt><dd>{artifact.deletedAt ? text.deleted : date(artifact.expiresAt, locale)}</dd></div>
          </dl>
        </section>
        <section>
          <h2>{text.runContext}</h2>
          {run ? <dl className="detail-list"><div><dt>{text.status}</dt><dd><StatusPill locale={locale} value={run.status} /></dd></div><div><dt>{text.mode}</dt><dd>{run.mode}</dd></div><div><dt>{text.started}</dt><dd>{date(run.startedAt, locale)}</dd></div><div><dt>{text.finished}</dt><dd>{date(run.finishedAt, locale)}</dd></div><div><dt>{text.error}</dt><dd>{[run.errorCode, run.errorSummary].filter(Boolean).join(" · ") || "—"}</dd></div></dl> : <p className="empty-inline">{text.runUnavailable}</p>}
        </section>
        <section>
          <h2>{text.content}</h2>
          {artifact.containsSensitiveData ? <div className="admin-empty compact"><h2>{text.sensitiveTitle}</h2><p>{text.sensitiveBody}</p></div> : artifact.deletedAt ? <div className="admin-empty compact"><h2>{text.deletedTitle}</h2><p>{text.deletedBody}</p></div> : screenshot ? <div className="artifact-image"><Image src={contentUrl} alt={text.screenshotAlt} width={1440} height={900} unoptimized /></div> : contentAvailable ? <a className="admin-secondary-action" href={contentUrl} target="_blank" rel="noreferrer">{text.openContent}</a> : <p className="empty-inline">{text.noFile}</p>}
          {payloadVisible ? <><h3>{text.payload}</h3><pre className="evidence-block data-payload">{JSON.stringify(artifact.payload, null, 2)}</pre></> : null}
        </section>
        <section>
          <h2>{text.derived}</h2>
          <div className="derived-record-groups">
            <DerivedGroup title={text.sourceOccurrences} empty={text.none} items={sourceOccurrences.map((item) => `${item.title} · ${item.externalId} · ${item.status}`)} />
            <DerivedGroup title={text.sourceSignals} empty={text.none} items={sourceSignals.map((item) => `${item.title} · ${item.externalId} · ${item.direction}`)} />
            <DerivedGroup title={text.rateObservations} empty={text.none} items={rates.map((item) => `${item.property.canonicalName} · ${item.sellableUnit.officialName} · ${new Intl.NumberFormat(adminDateLocale(locale), { style: "currency", currency: "NZD" }).format(item.nzdTotalMinor / 100)}`)} />
          </div>
        </section>
      </div>
    </section>
  );
}

function DerivedGroup({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <div><h3>{title}<span>{items.length}</span></h3>{items.length ? <ul>{items.map((item, index) => <li key={`${index}:${item}`}>{item}</li>)}</ul> : <p>{empty}</p>}</div>;
}

function date(value: Date | null, locale: AdminLocale) {
  return value ? value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—";
}

function copy(locale: AdminLocale) {
  return locale === "zh" ? {
    title: "原始证据详情", back: "返回原始证据", metadata: "证据元数据", source: "数据来源", type: "证据类型", run: "采集运行", storage: "存储引用", hash: "内容哈希", parser: "解析状态", sensitivity: "敏感性", created: "创建时间", expires: "过期时间", deleted: "已删除",
    runContext: "运行上下文", status: "状态", mode: "模式", started: "开始时间", finished: "结束时间", error: "错误", runUnavailable: "对应的采集运行不存在。",
    content: "证据内容", sensitiveTitle: "敏感内容已阻止", sensitiveBody: "此证据只显示元数据，内容不能通过 Admin 下载或预览。", deletedTitle: "内容已删除", deletedBody: "证据已按保留策略清理，只保留审计元数据。", screenshotAlt: "浏览器采集证据截图", openContent: "打开只读证据内容", noFile: "此记录没有可直接读取的证据文件。", payload: "已脱敏数据库载荷",
    derived: "同次运行产生的数据", sourceOccurrences: "来源事件场次", sourceSignals: "来源市场信号", rateObservations: "价格观测", none: "没有记录。",
  } : {
    title: "Raw Artifact Detail", back: "Back to raw evidence", metadata: "Artifact metadata", source: "Data source", type: "Artifact type", run: "Collection run", storage: "Storage reference", hash: "Content hash", parser: "Parser status", sensitivity: "Sensitivity", created: "Created", expires: "Expires", deleted: "Deleted",
    runContext: "Run context", status: "Status", mode: "Mode", started: "Started", finished: "Finished", error: "Error", runUnavailable: "The collection run is unavailable.",
    content: "Evidence content", sensitiveTitle: "Sensitive content blocked", sensitiveBody: "Only metadata is shown. This artifact cannot be downloaded or previewed from Admin.", deletedTitle: "Content deleted", deletedBody: "The retention policy removed this evidence; audit metadata remains.", screenshotAlt: "Browser collection evidence screenshot", openContent: "Open read-only evidence content", noFile: "This record has no directly readable evidence file.", payload: "Redacted database payload",
    derived: "Data produced by the same run", sourceOccurrences: "Source event occurrences", sourceSignals: "Source market signals", rateObservations: "Rate observations", none: "No records.",
  };
}
