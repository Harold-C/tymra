import { prisma, type ExceptionPriority, type ExceptionStatus, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

const statuses: ExceptionStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];
const priorities: ExceptionPriority[] = ["P0", "P1", "P2", "P3"];
type InboxKind = "all" | "business" | "collection";

export default async function ExceptionsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const text = copy(locale);
  const kind: InboxKind = searchParams.kind === "business" || searchParams.kind === "collection" ? searchParams.kind : "all";
  const status = statuses.includes(searchParams.status as ExceptionStatus) ? searchParams.status as ExceptionStatus : undefined;
  const priority = priorities.includes(searchParams.priority as ExceptionPriority) ? searchParams.priority as ExceptionPriority : undefined;
  const sourceScope: Prisma.DataSourceWhereInput = { isDemo: false };
  const [businessCount, collectionCount, sources] = await Promise.all([
    prisma.exceptionCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.collectionIncident.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false, collectionRun: { dataSource: sourceScope } } }),
    prisma.dataSource.findMany({ where: sourceScope, orderBy: { name: "asc" }, select: { key: true, name: true } }),
  ]);
  const selectedSource = sources.find((item) => item.key === searchParams.source)?.key;
  const shouldLoadBusiness = kind !== "collection";
  const shouldLoadCollection = kind !== "business";
  const [businessItems, collectionItems] = await Promise.all([
    shouldLoadBusiness ? prisma.exceptionCase.findMany({ where: { ...(status ? { status } : { status: { in: ["OPEN", "IN_PROGRESS"] } }), ...(priority ? { priority } : {}), isDemo: false }, orderBy: searchParams.sort === "oldest" ? { createdAt: "asc" } : [{ priority: "asc" }, { createdAt: "asc" }], take: 100, include: { priceCheck: { include: { property: { select: { canonicalName: true } }, unit: { select: { officialName: true } } } } } }) : [],
    shouldLoadCollection ? prisma.collectionIncident.findMany({ where: { ...(status ? { status } : { status: { in: ["OPEN", "IN_PROGRESS"] } }), ...(priority ? { severity: priority } : {}), isDemo: false, collectionRun: { dataSource: { ...sourceScope, ...(selectedSource ? { key: selectedSource } : {}) } } }, orderBy: searchParams.sort === "oldest" ? { createdAt: "asc" } : [{ severity: "asc" }, { createdAt: "asc" }], take: 100, include: { collectionRun: { include: { dataSource: { select: { key: true, name: true } } } } } }) : [],
  ]);
  const collectionGroups = groupCollectionIncidents(collectionItems);
  const visibleCount = businessItems.length + collectionGroups.length;

  return <section className="admin-page unified-inbox-page">
    <AdminPageHeader title={text.title} description={text.description} actions={<Link className="button button-secondary" href={inboxHref({ kind, status: "RESOLVED", source: selectedSource })}>{text.viewResolved}</Link>} />
    <nav className="data-explorer-tabs inbox-tabs" aria-label={text.inboxTypes}>
      <Link href={inboxHref({ kind: "all" })} aria-current={kind === "all" ? "page" : undefined}>{text.all}<span>{businessCount + collectionCount}</span></Link>
      <Link href={inboxHref({ kind: "business" })} aria-current={kind === "business" ? "page" : undefined}>{text.business}<span>{businessCount}</span></Link>
      <Link href={inboxHref({ kind: "collection" })} aria-current={kind === "collection" ? "page" : undefined}>{text.collection}<span>{collectionCount}</span></Link>
    </nav>
    <form className="admin-filters" method="get"><input type="hidden" name="kind" value={kind} /><label>{text.status}<select name="status" defaultValue={status ?? ""}><option value="">{text.openAndProgress}</option>{statuses.map((value) => <option value={value} key={value}>{labelStatus(value, locale)}</option>)}</select></label><label>{text.priority}<select name="priority" defaultValue={priority ?? ""}><option value="">{text.allPriorities}</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>{kind !== "business" ? <label>{text.source}<select name="source" defaultValue={selectedSource ?? ""}><option value="">{text.allSources}</option>{sources.map((source) => <option key={source.key} value={source.key}>{source.name}</option>)}</select></label> : null}<label>{text.sort}<select name="sort" defaultValue={searchParams.sort ?? "priority"}><option value="priority">{text.priority}</option><option value="oldest">{text.oldestFirst}</option></select></label><button className="button button-secondary" type="submit">{text.apply}</button></form>
    {visibleCount ? <div className="exception-list">
      {businessItems.map((item) => <Link href={`/admin/exceptions/${item.id}`} key={item.id} className="exception-row"><div><StatusPill value={item.priority} locale={locale} /><StatusPill value={item.type} locale={locale} /></div><div><strong>{item.priceCheck.property?.canonicalName ?? text.unconfirmedProperty}</strong><span>{item.priceCheck.unit?.officialName ?? text.unitNotConfirmed}</span><small>{text.businessImpact} · {item.priceCheck.id}</small></div><div><StatusPill value={item.status} locale={locale} /><span>{item.blockingUser ? text.userBlocking : text.internalReview}</span></div></Link>)}
      {collectionGroups.map((group) => <article className="exception-row exception-group" key={group.key}><div><StatusPill value={group.severity} locale={locale} /><StatusPill value={group.category} locale={locale} /></div><div><strong>{group.sourceName}</strong><span>{group.title}</span><small>{group.summary}</small><p>{text.suggestedAction}: {suggestion(group.category, locale)}</p></div><div><strong>{text.occurrences.replace("{count}", String(group.items.length))}</strong><span>{text.latest}: {date(group.latestAt, locale)}</span><div className="exception-row-actions"><Link href={`/admin/collection-runs/${group.items[0].collectionRunId}`}>{text.reviewLatest}</Link><Link href={`/admin/data-sources/${group.sourceKey}`}>{text.manageSource}</Link></div></div></article>)}
    </div> : <div className="admin-empty"><h2>{text.clear}</h2><p>{kind === "all" ? text.allClear : kind === "business" ? text.businessClear : text.collectionClear}</p></div>}
  </section>;
}

type CollectionItem = Awaited<ReturnType<typeof prisma.collectionIncident.findMany>>[number] & { collectionRun: { dataSource: { key: string; name: string } } };
function groupCollectionIncidents(items: CollectionItem[]) {
  const groups = new Map<string, { key: string; sourceKey: string; sourceName: string; category: string; severity: string; title: string; summary: string; latestAt: Date; items: CollectionItem[] }>();
  for (const item of items) {
    const key = `${item.collectionRun.dataSource.key}:${item.category}`;
    const existing = groups.get(key);
    if (existing) { existing.items.push(item); if (item.createdAt > existing.latestAt) existing.latestAt = item.createdAt; continue; }
    groups.set(key, { key, sourceKey: item.collectionRun.dataSource.key, sourceName: item.collectionRun.dataSource.name, category: item.category, severity: item.severity, title: item.title, summary: item.summary, latestAt: item.createdAt, items: [item] });
  }
  return [...groups.values()].sort((a, b) => a.severity.localeCompare(b.severity) || b.latestAt.getTime() - a.latestAt.getTime());
}
function suggestion(category: string, locale: AdminLocale) { const value = category.toUpperCase(); if (/RATE|LIMIT/.test(value)) return locale === "zh" ? "检查冷却窗口并调整采集频率" : "Review cooldown and collection frequency"; if (/CHALLENGE|BLOCK/.test(value)) return locale === "zh" ? "检查浏览器接管与来源策略" : "Review browser takeover and source policy"; if (/PARSE|FORMAT/.test(value)) return locale === "zh" ? "查看原始证据并更新解析规则" : "Inspect raw evidence and parser rules"; return locale === "zh" ? "检查最新运行诊断与来源健康" : "Review the latest run diagnostics and source health"; }
function inboxHref(input: { kind: InboxKind; status?: string; source?: string }) { const params = new URLSearchParams({ kind: input.kind }); if (input.status) params.set("status", input.status); if (input.source) params.set("source", input.source); return `/admin/exceptions?${params}`; }
function labelStatus(value: ExceptionStatus, locale: AdminLocale) { const labels = locale === "zh" ? { OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已解决", DISMISSED: "已忽略" } : { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", DISMISSED: "Dismissed" }; return labels[value]; }
function date(value: Date, locale: AdminLocale) { return value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }); }
function copy(locale: AdminLocale) { return locale === "zh" ? zh : en; }
const en = { title: "Inbox & incidents", description: "A consolidated action queue for customer-blocking exceptions and grouped collection incidents.", viewResolved: "View resolved", inboxTypes: "Inbox types", all: "All pending", business: "Business exceptions", collection: "Collection incidents", status: "Status", openAndProgress: "Open and in progress", priority: "Priority", allPriorities: "All priorities", source: "Data source", allSources: "All sources", sort: "Sort", oldestFirst: "Oldest first", apply: "Apply filters", unconfirmedProperty: "Unconfirmed property", unitNotConfirmed: "Unit not confirmed", userBlocking: "User blocking", internalReview: "Internal review", clear: "This queue is clear", allClear: "No pending work matches these filters.", businessClear: "No business exceptions match these filters. Collection incidents may still be available in another tab.", collectionClear: "No collection incidents match these filters. Business exceptions may still be available in another tab.", businessImpact: "Review customer-blocking evidence", occurrences: "{count} occurrences", latest: "Latest", suggestedAction: "Suggested action", reviewLatest: "Review latest run", manageSource: "Manage source" };
const zh: typeof en = { title: "待办与异常", description: "统一处理阻塞客户的业务异常，以及按原因聚合的采集运行异常。", viewResolved: "查看已解决", inboxTypes: "待办类型", all: "全部待办", business: "业务异常", collection: "采集异常", status: "状态", openAndProgress: "待处理和处理中", priority: "优先级", allPriorities: "全部优先级", source: "数据来源", allSources: "全部来源", sort: "排序", oldestFirst: "最早优先", apply: "应用筛选", unconfirmedProperty: "房源未确认", unitNotConfirmed: "房型未确认", userBlocking: "阻塞用户", internalReview: "内部审核", clear: "当前队列已清空", allClear: "没有符合当前筛选条件的待办。", businessClear: "没有符合条件的业务异常；其他标签中可能仍有采集异常。", collectionClear: "没有符合条件的采集异常；其他标签中可能仍有业务异常。", businessImpact: "检查阻塞客户的证据", occurrences: "共 {count} 次", latest: "最近发生", suggestedAction: "建议动作", reviewLatest: "查看最近运行", manageSource: "管理来源" };
