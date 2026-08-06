import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";

import { adminDateLocale, adminLabel, adminText, type AdminLocale, type AdminMessageKey } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

import { AdminTable, StatusPill, type AdminColumn, type AdminRow } from "./AdminTable";

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

export async function AdminResourcePage({ resource }: { resource: AdminResource }) {
  const locale = getAdminLocale();
  const [titleKey, descriptionKey] = titles[resource];
  const title = adminText(locale, titleKey);
  const description = adminText(locale, descriptionKey);
  if (resource === "settings") return <SettingsPage locale={locale} title={title} description={description} />;
  const { columns, rows } = await loadResource(resource, locale);
  return <section className="admin-page"><AdminPageHeader title={title} description={description} /><AdminTable columns={columns} rows={rows} emptyTitle={adminText(locale, "noRecords")} emptyBody={adminText(locale, "noRecordsBody")} /></section>;
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
    ["Provider mode", environment.PROVIDER_MODE], ["Public collection mode", environment.PUBLIC_COLLECTION_MODE], ["Scheduler", yesNo(environment.SCHEDULER_ENABLED, locale)], ["Default market", environment.DEFAULT_MARKET], ["Auto publish", yesNo(environment.AUTO_PUBLISH_ENABLED, locale)], ["Accept new checks", yesNo(environment.ACCEPT_NEW_CHECKS, locale)], ["Customer funnel", yesNo(environment.CUSTOMER_FUNNEL_ENABLED, locale)], ["Email provider", environment.EMAIL_PROVIDER], ["Result link lifetime", locale === "zh" ? `${environment.RESULT_LINK_TTL_DAYS} 天` : `${environment.RESULT_LINK_TTL_DAYS} days`], ["Worker lease", locale === "zh" ? `${environment.WORKER_LEASE_SECONDS} 秒` : `${environment.WORKER_LEASE_SECONDS} seconds`], ["Application URL", environment.APP_BASE_URL],
  ];
  const settingsLabels: Record<string, string> = locale === "zh" ? { "Provider mode": "数据提供模式", "Public collection mode": "公开采集模式", Scheduler: "定时任务", "Default market": "默认市场", "Auto publish": "自动发布", "Accept new checks": "接受新检查", "Customer funnel": "客户漏斗", "Email provider": "邮件服务", "Result link lifetime": "结果链接有效期", "Worker lease": "Worker 租约", "Application URL": "应用地址" } : {};
  return <section className="admin-page"><AdminPageHeader title={title} description={description} /><dl className="settings-list">{settings.map(([label, value]) => <div key={label}><dt>{settingsLabels[label] ?? label}</dt><dd>{value}</dd></div>)}</dl><p className="settings-note">{adminText(locale, "settingsNote")}</p></section>;
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
