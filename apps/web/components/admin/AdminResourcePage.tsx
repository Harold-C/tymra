import { getEnvironment } from "@tymra/config";
import { prisma, type Prisma } from "@tymra/db";

import { adminListHref, adminListState } from "@/lib/admin-list";
import { adminDateLocale, adminLabel, adminText, formatAdminValue, type AdminLocale, type AdminMessageKey } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

import { AdminListTools } from "./AdminListControls";
import { AdminCopyButton } from "./AdminCopyButton";
import { AdminListSummary, AdminPagination, AdminTable, StatusPill, type AdminColumn, type AdminRow } from "./AdminTable";

export type AdminResource = "properties" | "units" | "listings" | "competitors" | "marketCoverage" | "collectionRuns" | "dataSources" | "events" | "signals" | "feedback" | "audit" | "settings";

const titles: Record<AdminResource, [AdminMessageKey, AdminMessageKey]> = {
  properties: ["propertiesTitle", "propertiesDescription"],
  units: ["unitsTitle", "unitsDescription"],
  listings: ["listingsTitle", "listingsDescription"],
  competitors: ["competitorsTitle", "competitorsDescription"],
  marketCoverage: ["coverageTitle", "coverageDescription"],
  collectionRuns: ["runsTitle", "runsDescription"],
  dataSources: ["sourcesTitle", "sourcesDescription"],
  events: ["eventsTitle", "eventsDescription"],
  signals: ["signalsTitle", "signalsDescription"],
  feedback: ["feedbackTitle", "feedbackDescription"],
  audit: ["auditTitle", "auditDescription"],
  settings: ["settingsTitle", "settingsDescription"],
};

export async function AdminResourcePage({ resource, searchParams = {} }: { resource: AdminResource; searchParams?: Record<string, string | undefined> }) {
  const locale = getAdminLocale();
  const [titleKey, descriptionKey] = titles[resource];
  const title = adminText(locale, titleKey);
  const description = adminText(locale, descriptionKey);
  if (resource === "settings") return <SettingsPage locale={locale} title={title} description={description} />;
  if (["listings", "competitors", "feedback", "audit"].includes(resource)) {
    const { page, pageSize, skip } = adminListState(searchParams);
    const q = searchParams.q?.trim().slice(0, 100) ?? "";
    const kind = searchParams.kind?.trim().slice(0, 80) ?? "";
    const days = ["7", "30", "90"].includes(searchParams.days ?? "") ? Number(searchParams.days) : undefined;
    const result = await loadPaginatedResource(resource as "listings" | "competitors" | "feedback" | "audit", locale, { q, kind, skip, take: pageSize, since: days ? new Date(Date.now() - days * 86_400_000) : undefined });
    const pathname = `/admin/${resource}`;
    return <section className="admin-page"><AdminPageHeader title={title} description={description} /><form className="admin-filters" method="get"><label>{adminText(locale, "search")}<input name="q" defaultValue={q} placeholder={resource === "audit" ? (locale === "zh" ? "事件、实体或 ID" : "Event, entity or ID") : locale === "zh" ? "名称、ID 或备注" : "Name, ID or comment"} /></label>{resource === "feedback" ? <label>{locale === "zh" ? "反馈类型" : "Feedback type"}<select name="kind" defaultValue={kind}><option value="">{locale === "zh" ? "全部类型" : "All types"}</option>{["COMPETITORS_RELEVANT", "COMPETITORS_NOT_RELEVANT", "INSIGHT_USEFUL", "REVIEWED_PRICE", "CHANGED_PRICE", "NO_ACTION_NEEDED", "REPORT_ISSUE"].map((value) => <option value={value} key={value}>{formatAdminValue(locale, value)}</option>)}</select></label> : resource === "audit" ? <label>{locale === "zh" ? "实体类型" : "Entity type"}<input name="kind" defaultValue={kind} placeholder={locale === "zh" ? "例如 CustomerUser" : "e.g. CustomerUser"} /></label> : null}{resource === "audit" || resource === "feedback" ? <label>{locale === "zh" ? "时间范围" : "Time range"}<select name="days" defaultValue={days ? String(days) : ""}><option value="">{locale === "zh" ? "全部时间" : "All time"}</option><option value="7">{locale === "zh" ? "最近 7 天" : "Last 7 days"}</option><option value="30">{locale === "zh" ? "最近 30 天" : "Last 30 days"}</option><option value="90">{locale === "zh" ? "最近 90 天" : "Last 90 days"}</option></select></label> : null}<button className="button button-secondary" type="submit">{adminText(locale, "applyFilters")}</button></form><AdminListSummary locale={locale} total={result.total} tools={<AdminListTools locale={locale} viewName={title} />} /><AdminTable columns={result.columns} rows={result.rows} emptyTitle={adminText(locale, "noRecords")} emptyBody={adminText(locale, "noRecordsBody")} /><AdminPagination locale={locale} page={page} pageSize={pageSize} total={result.total} href={(nextPage, nextSize = pageSize) => adminListHref(pathname, searchParams, { page: Math.max(1, nextPage), pageSize: nextSize })} /></section>;
  }
  const { columns, rows } = await loadResource(resource, locale);
  return <section className="admin-page"><AdminPageHeader title={title} description={description} /><AdminTable columns={columns} rows={rows} emptyTitle={adminText(locale, "noRecords")} emptyBody={adminText(locale, "noRecordsBody")} /></section>;
}

async function loadPaginatedResource(resource: "listings" | "competitors" | "feedback" | "audit", locale: AdminLocale, page: { q: string; kind: string; skip: number; take: number; since?: Date }): Promise<{ columns: AdminColumn[]; rows: AdminRow[]; total: number }> {
  if (resource === "listings") {
    const where: Prisma.ListingWhereInput = { isDemo: false, ...(page.q ? { OR: [{ externalId: { contains: page.q, mode: "insensitive" } }, { unit: { officialName: { contains: page.q, mode: "insensitive" } } }, { dataSource: { name: { contains: page.q, mode: "insensitive" } } }] } : {}) };
    const [total, items] = await Promise.all([prisma.listing.count({ where }), prisma.listing.findMany({ where, orderBy: { firstDiscoveredAt: "desc" }, skip: page.skip, take: page.take, include: { unit: { select: { officialName: true } }, dataSource: { select: { name: true } } } })]);
    return { total, ...table(locale, ["Listing", "Unit", "Source", "Platform", "Status", "Last confirmed"], items.map((item) => [<><strong>{item.unit.officialName}</strong><small>{item.externalId}</small></>, item.unit.officialName, item.dataSource.name, item.platform, pill(item.onlineStatus, locale), date(item.lastConfirmedAt, locale)]), items.map((item) => `/admin/accommodations/${item.propertyId}`)) };
  }
  if (resource === "competitors") {
    const where: Prisma.CompetitorRelationshipWhereInput = { isDemo: false, ...(page.q ? { OR: [{ targetUnit: { officialName: { contains: page.q, mode: "insensitive" } } }, { competitorUnit: { officialName: { contains: page.q, mode: "insensitive" } } }] } : {}) };
    const [total, items] = await Promise.all([prisma.competitorRelationship.count({ where }), prisma.competitorRelationship.findMany({ where, orderBy: [{ targetUnitId: "asc" }, { version: "desc" }], skip: page.skip, take: page.take, include: { targetUnit: { select: { officialName: true, propertyId: true } }, competitorUnit: { select: { officialName: true } } } })]);
    return { total, ...table(locale, ["Target Unit", "Competitor", "Role", "Version", "Valid to", "Override"], items.map((item) => [<><strong>{item.targetUnit.officialName}</strong><small>{item.targetUnitId}</small></>, item.competitorUnit.officialName, pill(item.role, locale), item.version, date(item.validTo, locale), adminText(locale, item.manualOverride ? "manual" : "system")]), items.map((item) => `/admin/accommodations/${item.targetUnit.propertyId}`)) };
  }
  if (resource === "feedback") {
    const where: Prisma.FeedbackWhereInput = { isDemo: false, ...(page.kind ? { type: page.kind as never } : {}), ...(page.since ? { createdAt: { gte: page.since } } : {}), ...(page.q ? { OR: [{ id: { contains: page.q, mode: "insensitive" } }, { priceCheckId: { contains: page.q, mode: "insensitive" } }, { comment: { contains: page.q, mode: "insensitive" } }] } : {}) };
    const [total, items] = await Promise.all([prisma.feedback.count({ where }), prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take })]);
    return { total, ...table(locale, ["Feedback", "Type", "Price Check", "Comment", "Created", "Data"], items.map((item) => [<><strong>{formatCompactId(item.id)}</strong><small>{item.id}</small></>, pill(item.type, locale), item.priceCheckId, item.comment || "—", date(item.createdAt, locale), demo(item.isDemo, locale)]), items.map((item) => `/admin/checks/${item.priceCheckId}`)) };
  }
  const where: Prisma.AuditEventWhereInput = { isDemo: false, ...(page.kind ? { entityType: { contains: page.kind, mode: "insensitive" } } : {}), ...(page.since ? { createdAt: { gte: page.since } } : {}), ...(page.q ? { OR: [{ eventType: { contains: page.q, mode: "insensitive" } }, { entityType: { contains: page.q, mode: "insensitive" } }, { entityId: { contains: page.q, mode: "insensitive" } }] } : {}) };
  const [total, items] = await Promise.all([prisma.auditEvent.count({ where }), prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take })]);
  return { total, ...table(locale, ["Event", "Entity", "Entity ID", "Actor", "Created", "Data"], items.map((item) => [pill(item.eventType, locale), item.entityType, <span className="code-value" key={item.id}>{item.entityId}</span>, item.actorAdminId || adminText(locale, "system"), date(item.createdAt, locale), demo(item.isDemo, locale)])) };
}

export function AdminPageHeader({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return <header className="admin-page-header"><div><h1>{title}</h1><p>{description}</p></div>{actions ? <div>{actions}</div> : null}</header>;
}

async function loadResource(resource: Exclude<AdminResource, "settings">, locale: AdminLocale): Promise<{ columns: AdminColumn[]; rows: AdminRow[] }> {
  switch (resource) {
    case "properties": {
      const items = await prisma.property.findMany({ orderBy: { canonicalName: "asc" }, take: 100, include: { _count: { select: { units: true, priceChecks: true } } } });
      return table(locale, ["Property", "City", "Support", "Units", "Checks", "Data"], items.map((item) => [item.canonicalName, item.city, pill(item.supportStatus, locale), item._count.units, item._count.priceChecks, demo(item.isDemo, locale)]), items.map((item) => `/admin/accommodations/${item.id}`));
    }
    case "units": {
      const items = await prisma.sellableUnit.findMany({ orderBy: { officialName: "asc" }, take: 100, include: { property: { select: { canonicalName: true } }, _count: { select: { listings: true, priceChecks: true } } } });
      return table(locale, ["Unit", "Property", "Capacity", "Status", "Listings", "Checks"], items.map((item) => [item.officialName, item.property.canonicalName, item.capacity, pill(item.status, locale), item._count.listings, item._count.priceChecks]), items.map((item) => `/admin/accommodations/${item.propertyId}#unit-${item.id}`));
    }
    case "listings": {
      const items = await prisma.listing.findMany({ orderBy: { firstDiscoveredAt: "desc" }, take: 100, include: { unit: { select: { officialName: true } }, dataSource: { select: { name: true } } } });
      return table(locale, ["Listing", "Unit", "Source", "Platform", "Status", "Last confirmed"], items.map((item) => [item.externalId, item.unit.officialName, item.dataSource.name, item.platform, pill(item.onlineStatus, locale), date(item.lastConfirmedAt, locale)]), items.map((item) => `/admin/accommodations/${item.propertyId}`));
    }
    case "competitors": {
      const items = await prisma.competitorRelationship.findMany({ orderBy: [{ targetUnitId: "asc" }, { version: "desc" }], take: 100, include: { targetUnit: { select: { officialName: true, propertyId: true } }, competitorUnit: { select: { officialName: true } } } });
      return table(locale, ["Target Unit", "Competitor", "Role", "Version", "Valid to", "Override"], items.map((item) => [item.targetUnit.officialName, item.competitorUnit.officialName, pill(item.role, locale), item.version, date(item.validTo, locale), adminText(locale, item.manualOverride ? "manual" : "system")]), items.map((item) => `/admin/accommodations/${item.targetUnit.propertyId}`));
    }
    case "marketCoverage": {
      const items = await prisma.marketCoverage.findMany({ orderBy: { name: "asc" } });
      return table(locale, ["Market", "Status", "Properties", "Units", "24h coverage", "Accepting checks"], items.map((item) => [item.name, pill(item.status, locale), item.knownPropertyCount, item.knownUnitCount, percent(item.coverage24h), adminText(locale, item.acceptNewChecks ? "yes" : "no")]));
    }
    case "collectionRuns": {
      const items = await prisma.collectionRun.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { dataSource: { select: { name: true } } } });
      return table(locale, ["Collection Run", "Source", "Mode", "Status", "Succeeded", "Started"], items.map((item) => [item.id, item.dataSource.name, item.mode, pill(item.status, locale), item.successCount, date(item.startedAt, locale)]));
    }
    case "dataSources": {
      const items = await prisma.dataSource.findMany({ orderBy: { name: "asc" } });
      return table(locale, ["Data Source", "Type", "Lifecycle", "Health", "Enabled"], items.map((item) => [item.name, item.providerType, pill(item.lifecycle, locale), pill(item.healthStatus, locale), adminText(locale, item.enabled ? "yes" : "no")]));
    }
    case "events": {
      const items = await prisma.eventOccurrence.findMany({ orderBy: { startsAt: "desc" }, take: 150, include: { canonicalEvent: true, venue: true, sourceLinks: { include: { sourceEventOccurrence: { include: { dataSource: { select: { name: true } } } } } } } });
      return table(locale, ["Event", "Sources", "Location", "Category", "Status", "Starts", "Impact"], items.map((item) => {
        const sources = [...new Set(item.sourceLinks.map((link) => link.sourceEventOccurrence.dataSource.name))].join(", ");
        return [item.canonicalEvent.title, sources || adminText(locale, "unlinked"), [item.venue?.city, item.venue?.region].filter(Boolean).join(", ") || adminText(locale, "newZealand"), item.canonicalEvent.category ?? adminText(locale, "unclassified"), pill(item.status, locale), date(item.startsAt, locale), pill(item.impactStatus, locale)];
      }));
    }
    case "signals": {
      const items = await prisma.marketSignal.findMany({ orderBy: { startsAt: "desc" }, take: 100 });
      return table(locale, ["Signal", "Market", "Region", "Status", "Starts", "Ends"], items.map((item) => [item.type.replaceAll("_", " "), item.marketKey, item.region, pill(item.status, locale), date(item.startsAt, locale), date(item.endsAt, locale)]));
    }
    case "feedback": {
      const items = await prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
      return table(locale, ["Feedback", "Type", "Price Check", "Comment", "Created", "Data"], items.map((item) => [item.id, pill(item.type, locale), item.priceCheckId, item.comment || "—", date(item.createdAt, locale), demo(item.isDemo, locale)]));
    }
    case "audit": {
      const items = await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 150 });
      return table(locale, ["Event", "Entity", "Entity ID", "Actor", "Created", "Data"], items.map((item) => [item.eventType, item.entityType, item.entityId, item.actorAdminId || adminText(locale, "system"), date(item.createdAt, locale), demo(item.isDemo, locale)]));
    }
  }
}

function SettingsPage({ locale, title, description }: { locale: AdminLocale; title: string; description: string }) {
  const environment = getEnvironment();
  const settings = [
    ["collection", "Provider mode", environment.PROVIDER_MODE], ["collection", "Public collection mode", environment.PUBLIC_COLLECTION_MODE], ["collection", "Scheduler", yesNo(environment.SCHEDULER_ENABLED, locale)], ["market", "Default market", environment.DEFAULT_MARKET], ["delivery", "Auto publish", yesNo(environment.AUTO_PUBLISH_ENABLED, locale)], ["delivery", "Accept new checks", yesNo(environment.ACCEPT_NEW_CHECKS, locale)], ["membership", "Customer funnel", yesNo(environment.CUSTOMER_FUNNEL_ENABLED, locale)], ["delivery", "Email provider", environment.EMAIL_PROVIDER], ["delivery", "Result link lifetime", locale === "zh" ? `${environment.RESULT_LINK_TTL_DAYS} 天` : `${environment.RESULT_LINK_TTL_DAYS} days`], ["collection", "Worker lease", locale === "zh" ? `${environment.WORKER_LEASE_SECONDS} 秒` : `${environment.WORKER_LEASE_SECONDS} seconds`], ["platform", "Application URL", environment.APP_BASE_URL],
  ];
  const settingsLabels: Record<string, string> = locale === "zh" ? { "Provider mode": "数据提供模式", "Public collection mode": "公开采集模式", Scheduler: "定时任务", "Default market": "默认市场", "Auto publish": "自动发布", "Accept new checks": "接受新检查", "Customer funnel": "客户漏斗", "Email provider": "邮件服务", "Result link lifetime": "结果链接有效期", "Worker lease": "Worker 租约", "Application URL": "应用地址" } : {};
  const groups = locale === "zh" ? { collection: "采集与任务", market: "市场默认值", delivery: "发布与交付", membership: "会员功能", platform: "平台地址" } : { collection: "Collection & jobs", market: "Market defaults", delivery: "Publishing & delivery", membership: "Membership features", platform: "Platform URLs" };
  return <section className="admin-page"><AdminPageHeader title={title} description={description} actions={<span className="overview-updated">{locale === "zh" ? "读取时间" : "Read at"} {new Date().toLocaleString(locale === "zh" ? "zh-CN" : "en-NZ", { timeZone: "Pacific/Auckland" })}</span>} />{Object.entries(groups).map(([group, groupLabel]) => <section className="settings-group" key={group}><h2>{groupLabel}</h2><dl className="settings-list">{settings.filter(([key]) => key === group).map(([, label, value]) => <div key={label}><dt>{settingsLabels[label] ?? label}</dt><dd><span>{value}</span><AdminCopyButton value={value} locale={locale} /></dd></div>)}</dl></section>)}<p className="settings-note">{adminText(locale, "settingsNote")}</p></section>;
}

function table(locale: AdminLocale, labels: string[], values: React.ReactNode[][], hrefs: Array<string | undefined> = []) {
  const columns = labels.map((label, index) => ({ key: `c${index}`, label: adminLabel(locale, label) }));
  const rows = values.map((value, index) => ({ id: String(index), href: hrefs[index], cells: Object.fromEntries(value.map((cell, cellIndex) => [`c${cellIndex}`, cell])) }));
  return { columns, rows };
}

function pill(value: string, locale: AdminLocale) { return <StatusPill value={value} locale={locale} />; }
function date(value: Date | null, locale: AdminLocale) { return value ? value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—"; }
function percent(value: number) { return `${Math.round(value * 100)}%`; }
function demo(value: boolean, locale: AdminLocale) { return value ? <span className="demo-inline">{adminText(locale, "demo")}</span> : adminText(locale, "livePath"); }
function yesNo(value: boolean, locale: AdminLocale) { return adminText(locale, value ? "enabled" : "disabled"); }
function formatCompactId(value: string) { return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value; }
