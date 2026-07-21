import { prisma, type ExceptionPriority, type ExceptionStatus, type Prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { StatusPill } from "@/components/admin/AdminTable";
import { adminDateLocale, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

const statuses: ExceptionStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "DISMISSED"];
const priorities: ExceptionPriority[] = ["P0", "P1", "P2", "P3"];
type InboxKind = "business" | "collection";

export default async function ExceptionsPage({ searchParams }: { searchParams: { kind?: string; status?: string; priority?: string; sort?: string; source?: string } }) {
  const locale = getAdminLocale();
  const text = copy(locale);
  const kind: InboxKind = searchParams.kind === "collection" ? "collection" : "business";
  const status = statuses.includes(searchParams.status as ExceptionStatus) ? searchParams.status as ExceptionStatus : undefined;
  const priority = priorities.includes(searchParams.priority as ExceptionPriority) ? searchParams.priority as ExceptionPriority : undefined;
  const sourceScope: Prisma.DataSourceWhereInput = { providerType: { in: ["PUBLIC", "MANUAL"] }, sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] }, isDemo: false };
  const [businessCount, collectionCount, sources] = await Promise.all([
    prisma.exceptionCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.collectionIncident.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false, collectionRun: { dataSource: sourceScope } } }),
    prisma.dataSource.findMany({ where: sourceScope, orderBy: { name: "asc" }, select: { key: true, name: true } }),
  ]);
  const selectedSource = sources.find((item) => item.key === searchParams.source)?.key;

  const items = kind === "business"
    ? await prisma.exceptionCase.findMany({
        where: { ...(status ? { status } : { status: { in: ["OPEN", "IN_PROGRESS"] } }), ...(priority ? { priority } : {}), isDemo: false },
        orderBy: searchParams.sort === "oldest" ? { createdAt: "asc" } : [{ priority: "asc" }, { createdAt: "asc" }],
        take: 100,
        include: { priceCheck: { include: { property: { select: { canonicalName: true } }, unit: { select: { officialName: true } } } } },
      })
    : await prisma.collectionIncident.findMany({
        where: { ...(status ? { status } : { status: { in: ["OPEN", "IN_PROGRESS"] } }), ...(priority ? { severity: priority } : {}), isDemo: false, collectionRun: { dataSource: { ...sourceScope, ...(selectedSource ? { key: selectedSource } : {}) } } },
        orderBy: searchParams.sort === "oldest" ? { createdAt: "asc" } : [{ severity: "asc" }, { createdAt: "asc" }],
        take: 100,
        include: { collectionRun: { include: { dataSource: { select: { key: true, name: true } } } } },
      });
  const resolvedHref = inboxHref({ kind, status: "RESOLVED", source: selectedSource });

  return <section className="admin-page unified-inbox-page">
    <AdminPageHeader title={text.title} description={text.description} actions={<Link className="button button-secondary" href={resolvedHref}>{text.viewResolved}</Link>} />
    <nav className="data-explorer-tabs inbox-tabs" aria-label={text.inboxTypes}>
      <Link href={inboxHref({ kind: "business" })} aria-current={kind === "business" ? "page" : undefined}>{text.business}<span>{businessCount}</span></Link>
      <Link href={inboxHref({ kind: "collection" })} aria-current={kind === "collection" ? "page" : undefined}>{text.collection}<span>{collectionCount}</span></Link>
    </nav>
    <form className="admin-filters" method="get">
      <input type="hidden" name="kind" value={kind} />
      <label>{text.status}<select name="status" defaultValue={status ?? ""}><option value="">{text.openAndProgress}</option>{statuses.map((value) => <option value={value} key={value}>{labelStatus(value, locale)}</option>)}</select></label>
      <label>{text.priority}<select name="priority" defaultValue={priority ?? ""}><option value="">{text.all}</option>{priorities.map((value) => <option key={value}>{value}</option>)}</select></label>
      {kind === "collection" ? <label>{text.source}<select name="source" defaultValue={selectedSource ?? ""}><option value="">{text.allSources}</option>{sources.map((source) => <option key={source.key} value={source.key}>{source.name}</option>)}</select></label> : null}
      <label>{text.sort}<select name="sort" defaultValue={searchParams.sort ?? "priority"}><option value="priority">{text.priority}</option><option value="oldest">{text.oldestFirst}</option></select></label>
      <button className="button button-secondary" type="submit">{text.apply}</button>
    </form>
    {items.length ? <div className="exception-list">{kind === "business" ? items.map((item) => {
      if (!("priceCheck" in item)) return null;
      return <Link href={`/admin/exceptions/${item.id}`} key={item.id} className="exception-row"><div><StatusPill value={item.priority} locale={locale} /><StatusPill value={item.type} locale={locale} /></div><div><strong>{item.priceCheck.property?.canonicalName ?? text.unconfirmedProperty}</strong><span>{item.priceCheck.unit?.officialName ?? text.unitNotConfirmed} · {item.priceCheck.id}</span></div><div><StatusPill value={item.status} locale={locale} /><span>{item.blockingUser ? text.userBlocking : text.internalReview}</span></div></Link>;
    }) : items.map((item) => {
      if (!("collectionRun" in item)) return null;
      return <Link href={`/admin/collection-runs/${item.collectionRunId}`} key={item.id} className="exception-row"><div><StatusPill value={item.severity} locale={locale} /><StatusPill value={item.category} locale={locale} /></div><div><strong>{item.title}</strong><span>{item.collectionRun.dataSource.name} · {item.collectionRunId}</span><small>{item.summary}</small></div><div><StatusPill value={item.status} locale={locale} /><span>{date(item.createdAt, locale)}</span></div></Link>;
    })}</div> : <div className="admin-empty"><h2>{text.clear}</h2><p>{kind === "business" ? text.businessClear : text.collectionClear}</p></div>}
  </section>;
}

function inboxHref(input: { kind: InboxKind; status?: string; source?: string }) {
  const params = new URLSearchParams({ kind: input.kind });
  if (input.status) params.set("status", input.status);
  if (input.source) params.set("source", input.source);
  return `/admin/exceptions?${params}`;
}

function labelStatus(value: ExceptionStatus, locale: AdminLocale) {
  const labels = locale === "zh" ? { OPEN: "待处理", IN_PROGRESS: "处理中", RESOLVED: "已解决", DISMISSED: "已忽略" } : { OPEN: "Open", IN_PROGRESS: "In progress", RESOLVED: "Resolved", DISMISSED: "Dismissed" };
  return labels[value];
}

function date(value: Date, locale: AdminLocale) { return value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }); }
function copy(locale: AdminLocale) { return locale === "zh" ? zh : en; }
const en = { title: "Inbox & incidents", description: "One action queue for customer-blocking business exceptions and collection incidents.", viewResolved: "View resolved", inboxTypes: "Inbox types", business: "Business exceptions", collection: "Collection incidents", status: "Status", openAndProgress: "Open and in progress", priority: "Priority", all: "All", source: "Data source", allSources: "All sources", sort: "Sort", oldestFirst: "Oldest first", apply: "Apply filters", unconfirmedProperty: "Unconfirmed property", unitNotConfirmed: "Unit not confirmed", userBlocking: "User blocking", internalReview: "Internal review", clear: "Inbox clear", businessClear: "No business exceptions match these filters.", collectionClear: "No collection incidents match these filters." };
const zh: typeof en = { title: "待办与异常", description: "统一处理阻塞客户的业务异常和采集运行异常。", viewResolved: "查看已解决", inboxTypes: "待办类型", business: "业务异常", collection: "采集异常", status: "状态", openAndProgress: "待处理和处理中", priority: "优先级", all: "全部", source: "数据来源", allSources: "全部来源", sort: "排序", oldestFirst: "最早优先", apply: "应用筛选", unconfirmedProperty: "房源未确认", unitNotConfirmed: "房型未确认", userBlocking: "阻塞用户", internalReview: "内部审核", clear: "待办队列已清空", businessClear: "没有符合当前筛选条件的业务异常。", collectionClear: "没有符合当前筛选条件的采集异常。" };
