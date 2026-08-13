import { Prisma, prisma } from "@tymra/db";
import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { AdminListTools } from "@/components/admin/AdminListControls";
import { AdminTable, StatusPill, type AdminColumn, type AdminRow } from "@/components/admin/AdminTable";
import { adminDateLocale, formatAdminValue, type AdminLocale } from "@/lib/admin-i18n";
import { getAdminLocale } from "@/lib/server/admin-locale";

const pageSize = 50;
const layers = ["standard", "source", "raw", "lineage", "frontier"] as const;
type ExplorerLayer = (typeof layers)[number];

type SearchParams = {
  layer?: string;
  dataset?: string;
  source?: string;
  q?: string;
  page?: string;
};

type ExplorerResult = {
  columns: AdminColumn[];
  rows: AdminRow[];
  total: number;
};

export default async function DataExplorerPage({ searchParams }: { searchParams: SearchParams }) {
  const locale = getAdminLocale();
  const text = copy(locale);
  const layer = normalizeLayer(searchParams.layer);
  const dataset = normalizeDataset(layer, searchParams.dataset);
  const page = positiveInteger(searchParams.page);
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const sources = await prisma.dataSource.findMany({
    where: {
      providerType: { in: ["PUBLIC", "MANUAL"] },
      sourceType: { in: ["PUBLIC_DATA", "MANUAL_IMPORT"] },
      isDemo: false,
    },
    orderBy: { name: "asc" },
    select: { id: true, key: true, name: true },
  });
  const selectedSource = sources.find((source) => source.key === searchParams.source);
  const sourceIds = selectedSource ? [selectedSource.id] : sources.map((source) => source.id);
  const sourceKey = selectedSource?.key ?? "";

  const [summary, result] = await Promise.all([
    loadSummary(sourceIds),
    loadLayer({ layer, dataset, sourceIds, q, page, locale }),
  ]);

  const state = { layer, dataset, source: sourceKey, q };
  return (
    <section className="admin-page data-explorer-page">
      <AdminPageHeader title={text.title} description={text.description} />
      <nav className="data-explorer-tabs" aria-label={text.layersLabel}>
        {layers.map((item) => <Link key={item} href={explorerHref({ ...state, layer: item, dataset: defaultDataset(item), page: 1 })} aria-current={layer === item ? "page" : undefined}>{text.layers[item]}<span>{summary[item]}</span></Link>)}
      </nav>
      <dl className="data-explorer-summary">
        <div><dt>{text.standardRecords}</dt><dd>{summary.standard.toLocaleString()}</dd></div>
        <div><dt>{text.sourceRecords}</dt><dd>{summary.source.toLocaleString()}</dd></div>
        <div><dt>{text.rawArtifacts}</dt><dd>{summary.raw.toLocaleString()}</dd></div>
        <div><dt>{text.lineageLinks}</dt><dd>{summary.lineage.toLocaleString()}</dd></div>
        <div><dt>{text.crawlTargets}</dt><dd>{summary.frontier.toLocaleString()}</dd></div>
      </dl>
      <DatasetTabs locale={locale} layer={layer} dataset={dataset} state={state} />
      <form className="admin-filters" method="get">
        <input type="hidden" name="layer" value={layer} />
        <input type="hidden" name="dataset" value={dataset} />
        <label>{text.source}<select name="source" defaultValue={sourceKey}><option value="">{text.allSources}</option>{sources.map((source) => <option key={source.id} value={source.key}>{source.name}</option>)}</select></label>
        <label>{text.search}<input name="q" defaultValue={q} placeholder={text.searchPlaceholder} /></label>
        <button className="button button-secondary" type="submit">{text.apply}</button>
        <Link className="button button-secondary" href={explorerHref({ layer, dataset, page: 1 })}>{text.reset}</Link>
      </form>
      <div className="data-explorer-result-meta"><strong>{datasetLabel(locale, layer, dataset)}</strong></div>
      <div className="admin-list-summary"><span>{text.total.replace("{count}", result.total.toLocaleString())}</span><AdminListTools locale={locale} viewName={`${text.title} · ${datasetLabel(locale, layer, dataset)}`} /></div>
      <AdminTable columns={result.columns} rows={result.rows} emptyTitle={text.emptyTitle} emptyBody={text.emptyBody} />
      <Pagination locale={locale} page={page} total={result.total} state={state} />
    </section>
  );
}

async function loadSummary(sourceIds: string[]) {
  if (!sourceIds.length) return { standard: 0, source: 0, raw: 0, lineage: 0, frontier: 0 };
  const [occurrences, signals, rates, sourceOccurrences, sourceSignals, raw, occurrenceLinks, signalLinks, frontier] = await Promise.all([
    prisma.eventOccurrence.count({ where: { isDemo: false, sourceLinks: { some: { sourceEventOccurrence: { dataSourceId: { in: sourceIds } } } } } }),
    prisma.marketSignal.count({
      where: {
        isDemo: false,
        OR: [
          { dataSourceId: { in: sourceIds } },
          { sourceLinks: { some: { sourceMarketSignal: { dataSourceId: { in: sourceIds } } } } },
        ],
      },
    }),
    prisma.rateObservation.count({ where: { isDemo: false, dataSourceId: { in: sourceIds } } }),
    prisma.sourceEventOccurrence.count({ where: { isDemo: false, dataSourceId: { in: sourceIds } } }),
    prisma.sourceMarketSignal.count({ where: { isDemo: false, dataSourceId: { in: sourceIds } } }),
    prisma.rawArtifact.count({ where: { dataSourceId: { in: sourceIds } } }),
    prisma.eventOccurrenceSourceLink.count({ where: { sourceEventOccurrence: { dataSourceId: { in: sourceIds } } } }),
    prisma.marketSignalSourceLink.count({ where: { sourceMarketSignal: { dataSourceId: { in: sourceIds } } } }),
    prisma.sourceCrawlTarget.count({ where: { dataSourceId: { in: sourceIds } } }),
  ]);
  return { standard: occurrences + signals + rates, source: sourceOccurrences + sourceSignals, raw, lineage: occurrenceLinks + signalLinks, frontier };
}

async function loadLayer(input: { layer: ExplorerLayer; dataset: string; sourceIds: string[]; q: string; page: number; locale: AdminLocale }): Promise<ExplorerResult> {
  if (!input.sourceIds.length) return { columns: [], rows: [], total: 0 };
  if (input.layer === "standard") return loadStandard(input);
  if (input.layer === "source") return loadSource(input);
  if (input.layer === "raw") return loadRaw(input);
  if (input.layer === "lineage") return loadLineage(input);
  return loadFrontier(input);
}

async function loadStandard(input: LoaderInput): Promise<ExplorerResult> {
  const { dataset, sourceIds, q, page, locale } = input;
  if (dataset === "signals") {
    const where: Prisma.MarketSignalWhereInput = {
      isDemo: false,
      AND: [
        { OR: [{ dataSourceId: { in: sourceIds } }, { sourceLinks: { some: { sourceMarketSignal: { dataSourceId: { in: sourceIds } } } } }] },
        ...(q ? [{ OR: [{ marketKey: { contains: q, mode: "insensitive" } }, { region: { contains: q, mode: "insensitive" } }, { status: { contains: q, mode: "insensitive" } }] } as Prisma.MarketSignalWhereInput] : []),
      ],
    };
    const [total, items] = await Promise.all([
      prisma.marketSignal.count({ where }),
      prisma.marketSignal.findMany({ where, orderBy: { startsAt: "desc" }, skip: offset(page), take: pageSize, include: { dataSource: { select: { name: true } }, sourceLinks: { include: { sourceMarketSignal: { include: { dataSource: { select: { name: true } } } } } } } }),
    ]);
    return table(locale, ["Signal", "Source", "Market", "Region", "Status", "Starts", "Ends"], items.map((item) => [formatAdminValue(locale, item.type), (item.dataSource?.name ?? unique(item.sourceLinks.map((link) => link.sourceMarketSignal.dataSource.name)).join(", ")) || "—", item.marketKey, item.region, pill(item.status, locale), date(item.startsAt, locale), date(item.endsAt, locale)]), total);
  }
  if (dataset === "rates") {
    const where: Prisma.RateObservationWhereInput = {
      isDemo: false,
      dataSourceId: { in: sourceIds },
      ...(q ? { OR: [{ property: { canonicalName: { contains: q, mode: "insensitive" } } }, { sellableUnit: { officialName: { contains: q, mode: "insensitive" } } }, { listing: { externalId: { contains: q, mode: "insensitive" } } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.rateObservation.count({ where }),
      prisma.rateObservation.findMany({ where, orderBy: { collectedAt: "desc" }, skip: offset(page), take: pageSize, include: { dataSource: { select: { name: true } }, property: { select: { canonicalName: true } }, sellableUnit: { select: { officialName: true } }, listing: { select: { externalId: true } } } }),
    ]);
    return table(locale, ["Property", "Unit", "Source", "Listing", "Stay", "Total", "Availability", "Collected"], items.map((item) => [item.property.canonicalName, item.sellableUnit.officialName, item.dataSource.name, item.listing.externalId, `${shortDate(item.checkIn, locale)} – ${shortDate(item.checkOut, locale)}`, money(item.nzdTotalMinor, locale), pill(item.availabilityStatus, locale), date(item.collectedAt, locale)]), total);
  }

  const where: Prisma.EventOccurrenceWhereInput = {
    isDemo: false,
    sourceLinks: { some: { sourceEventOccurrence: { dataSourceId: { in: sourceIds } } } },
    ...(q ? { OR: [{ canonicalKey: { contains: q, mode: "insensitive" } }, { canonicalEvent: { title: { contains: q, mode: "insensitive" } } }, { venue: { city: { contains: q, mode: "insensitive" } } }, { venue: { region: { contains: q, mode: "insensitive" } } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.eventOccurrence.count({ where }),
    prisma.eventOccurrence.findMany({ where, orderBy: { startsAt: "desc" }, skip: offset(page), take: pageSize, include: { canonicalEvent: true, venue: true, sourceLinks: { include: { sourceEventOccurrence: { include: { dataSource: { select: { name: true } } } } } } } }),
  ]);
  return table(locale, ["Event", "Source", "Location", "Category", "Status", "Starts", "Impact"], items.map((item) => [item.canonicalEvent.title, unique(item.sourceLinks.map((link) => link.sourceEventOccurrence.dataSource.name)).join(", ") || "—", [item.venue?.city, item.venue?.region].filter(Boolean).join(", ") || "—", item.canonicalEvent.category ?? "—", pill(item.status, locale), date(item.startsAt, locale), pill(item.impactStatus, locale)]), total);
}

async function loadSource(input: LoaderInput): Promise<ExplorerResult> {
  const { dataset, sourceIds, q, page, locale } = input;
  if (dataset === "events") {
    const where: Prisma.SourceEventWhereInput = { isDemo: false, dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { externalId: { contains: q, mode: "insensitive" } }, { status: { contains: q, mode: "insensitive" } }] } : {}) };
    const [total, items] = await Promise.all([
      prisma.sourceEvent.count({ where }),
      prisma.sourceEvent.findMany({ where, orderBy: { lastSeenAt: "desc" }, skip: offset(page), take: pageSize, include: { dataSource: { select: { name: true } }, _count: { select: { occurrences: true, canonicalLinks: true } } } }),
    ]);
    return table(locale, ["Event", "Source", "External ID", "Category", "Status", "Occurrences", "Canonical links", "Last seen"], items.map((item) => [external(item.title, item.sourceUrl), item.dataSource.name, item.externalId, item.category ?? "—", pill(item.status, locale), item._count.occurrences, item._count.canonicalLinks, date(item.lastSeenAt, locale)]), total);
  }
  if (dataset === "signals") {
    const where: Prisma.SourceMarketSignalWhereInput = { isDemo: false, dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { externalId: { contains: q, mode: "insensitive" } }, { region: { contains: q, mode: "insensitive" } }] } : {}) };
    const [total, items] = await Promise.all([
      prisma.sourceMarketSignal.count({ where }),
      prisma.sourceMarketSignal.findMany({ where, orderBy: { lastSeenAt: "desc" }, skip: offset(page), take: pageSize, include: { dataSource: { select: { name: true } }, canonicalLink: true } }),
    ]);
    return table(locale, ["Signal", "Source", "External ID", "Region", "Direction", "Confidence", "Canonical link", "Last seen"], items.map((item) => [item.title, item.dataSource.name, item.externalId, item.region, item.direction, percent(item.confidence), item.canonicalLink ? pill(item.canonicalLink.reviewStatus, locale) : "—", date(item.lastSeenAt, locale)]), total);
  }

  const where: Prisma.SourceEventOccurrenceWhereInput = { isDemo: false, dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { externalId: { contains: q, mode: "insensitive" } }, { city: { contains: q, mode: "insensitive" } }, { region: { contains: q, mode: "insensitive" } }] } : {}) };
  const [total, items] = await Promise.all([
    prisma.sourceEventOccurrence.count({ where }),
    prisma.sourceEventOccurrence.findMany({ where, orderBy: { lastSeenAt: "desc" }, skip: offset(page), take: pageSize, include: { dataSource: { select: { name: true } }, canonicalLinks: true } }),
  ]);
  return table(locale, ["Occurrence", "Source", "External ID", "Location", "Status", "Starts", "Canonical links", "Last seen"], items.map((item) => [external(item.title, item.sourceUrl), item.dataSource.name, item.externalId, [item.city, item.region].filter(Boolean).join(", ") || "—", pill(item.status, locale), date(item.startsAt, locale), item.canonicalLinks.length, date(item.lastSeenAt, locale)]), total);
}

async function loadRaw(input: LoaderInput): Promise<ExplorerResult> {
  const { sourceIds, q, page, locale } = input;
  const where: Prisma.RawArtifactWhereInput = { dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ id: { contains: q, mode: "insensitive" } }, { collectionRunId: { contains: q, mode: "insensitive" } }, { artifactType: { contains: q, mode: "insensitive" } }, { storageRef: { contains: q, mode: "insensitive" } }] } : {}) };
  const [total, items, sourceRows] = await Promise.all([
    prisma.rawArtifact.count({ where }),
    prisma.rawArtifact.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset(page), take: pageSize }),
    prisma.dataSource.findMany({ where: { id: { in: sourceIds } }, select: { id: true, name: true } }),
  ]);
  const sourceNames = new Map(sourceRows.map((source) => [source.id, source.name]));
  const columns = localizedColumns(locale, ["Artifact", "Source", "Type", "Collection Run", "Parser", "Sensitivity", "Created", "Expires"]);
  const rows = items.map((item) => ({ id: item.id, href: `/admin/data-explorer/raw/${item.id}`, cells: cells([item.id, sourceNames.get(item.dataSourceId) ?? item.dataSourceId, item.artifactType, item.collectionRunId, item.parserFailure ? pill("FAILED", locale) : pill("SUCCEEDED", locale), item.containsSensitiveData ? pill("BLOCKED", locale) : copy(locale).safe, date(item.createdAt, locale), item.deletedAt ? copy(locale).deleted : date(item.expiresAt, locale)]) }));
  return { columns, rows, total };
}

async function loadLineage(input: LoaderInput): Promise<ExplorerResult> {
  const { dataset, sourceIds, q, page, locale } = input;
  if (dataset === "signals") {
    const where: Prisma.MarketSignalSourceLinkWhereInput = { sourceMarketSignal: { dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { externalId: { contains: q, mode: "insensitive" } }] } : {}) } };
    const [total, items] = await Promise.all([
      prisma.marketSignalSourceLink.count({ where }),
      prisma.marketSignalSourceLink.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset(page), take: pageSize, include: { sourceMarketSignal: { include: { dataSource: { select: { name: true } } } }, marketSignal: true } }),
    ]);
    return table(locale, ["Source record", "Source", "Canonical record", "Match method", "Confidence", "Review status", "Created"], items.map((item) => [item.sourceMarketSignal.title, item.sourceMarketSignal.dataSource.name, `${formatAdminValue(locale, item.marketSignal.type)} · ${item.marketSignal.region}`, item.matchMethod, percent(item.matchConfidence), pill(item.reviewStatus, locale), date(item.createdAt, locale)]), total);
  }
  if (dataset === "events") {
    const where: Prisma.EventSourceLinkWhereInput = { sourceEvent: { dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { externalId: { contains: q, mode: "insensitive" } }] } : {}) } };
    const [total, items] = await Promise.all([
      prisma.eventSourceLink.count({ where }),
      prisma.eventSourceLink.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset(page), take: pageSize, include: { sourceEvent: { include: { dataSource: { select: { name: true } } } }, canonicalEvent: true } }),
    ]);
    return table(locale, ["Source record", "Source", "Canonical record", "Match method", "Confidence", "Review status", "Created"], items.map((item) => [external(item.sourceEvent.title, item.sourceEvent.sourceUrl), item.sourceEvent.dataSource.name, item.canonicalEvent.title, item.matchMethod, percent(item.matchConfidence), pill(item.reviewStatus, locale), date(item.createdAt, locale)]), total);
  }

  const where: Prisma.EventOccurrenceSourceLinkWhereInput = { sourceEventOccurrence: { dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { externalId: { contains: q, mode: "insensitive" } }] } : {}) } };
  const [total, items] = await Promise.all([
    prisma.eventOccurrenceSourceLink.count({ where }),
    prisma.eventOccurrenceSourceLink.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset(page), take: pageSize, include: { sourceEventOccurrence: { include: { dataSource: { select: { name: true } } } }, eventOccurrence: { include: { canonicalEvent: true } } } }),
  ]);
  return table(locale, ["Source record", "Source", "Canonical record", "Match method", "Confidence", "Review status", "Created"], items.map((item) => [external(item.sourceEventOccurrence.title, item.sourceEventOccurrence.sourceUrl), item.sourceEventOccurrence.dataSource.name, `${item.eventOccurrence.canonicalEvent.title} · ${shortDate(item.eventOccurrence.startsAt, locale)}`, item.matchMethod, percent(item.matchConfidence), pill(item.reviewStatus, locale), date(item.createdAt, locale)]), total);
}

async function loadFrontier(input: LoaderInput): Promise<ExplorerResult> {
  const { sourceIds, q, page, locale } = input;
  const where: Prisma.SourceCrawlTargetWhereInput = { dataSourceId: { in: sourceIds }, ...(q ? { OR: [{ url: { contains: q, mode: "insensitive" } }, { kind: { contains: q, mode: "insensitive" } }, { status: { contains: q, mode: "insensitive" } }, { lastErrorCode: { contains: q, mode: "insensitive" } }] } : {}) };
  const [total, items] = await Promise.all([
    prisma.sourceCrawlTarget.count({ where }),
    prisma.sourceCrawlTarget.findMany({ where, orderBy: [{ priority: "asc" }, { nextFetchAt: "asc" }], skip: offset(page), take: pageSize, include: { dataSource: { select: { name: true } } } }),
  ]);
  return table(locale, ["Target", "Source", "Kind", "Status", "Active", "Failures", "Last fetched", "Next fetch", "Last error"], items.map((item) => [external(compactUrl(item.url), item.url), item.dataSource.name, item.kind, pill(item.status, locale), item.active ? copy(locale).yes : copy(locale).no, item.consecutiveFailures, date(item.lastFetchedAt, locale), date(item.nextFetchAt, locale), item.lastErrorCode ?? "—"]), total);
}

type LoaderInput = { dataset: string; sourceIds: string[]; q: string; page: number; locale: AdminLocale };

function DatasetTabs({ locale, layer, dataset, state }: { locale: AdminLocale; layer: ExplorerLayer; dataset: string; state: { layer: ExplorerLayer; dataset: string; source: string; q: string } }) {
  const options = datasets(layer);
  if (options.length < 2) return null;
  return <nav className="data-explorer-datasets" aria-label={copy(locale).datasetsLabel}>{options.map((item) => <Link key={item} href={explorerHref({ ...state, dataset: item, page: 1 })} aria-current={dataset === item ? "page" : undefined}>{datasetLabel(locale, layer, item)}</Link>)}</nav>;
}

function Pagination({ locale, page, total, state }: { locale: AdminLocale; page: number; total: number; state: { layer: ExplorerLayer; dataset: string; source: string; q: string } }) {
  const text = copy(locale);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return <nav className="data-explorer-pagination" aria-label={text.pagination}><Link aria-disabled={page <= 1} href={page <= 1 ? "#" : explorerHref({ ...state, page: page - 1 })}>{text.previous}</Link><span>{text.page.replace("{page}", String(page)).replace("{total}", String(totalPages))}</span><Link aria-disabled={page >= totalPages} href={page >= totalPages ? "#" : explorerHref({ ...state, page: page + 1 })}>{text.next}</Link></nav>;
}

function table(locale: AdminLocale, labels: string[], values: React.ReactNode[][], total: number): ExplorerResult {
  return { columns: localizedColumns(locale, labels), rows: values.map((value, index) => ({ id: String(index), cells: cells(value) })), total };
}

function localizedColumns(locale: AdminLocale, labels: string[]): AdminColumn[] {
  const translated = explorerLabels(locale);
  return labels.map((label, index) => ({ key: `c${index}`, label: translated[label] ?? label }));
}

function cells(values: React.ReactNode[]) {
  return Object.fromEntries(values.map((cell, index) => [`c${index}`, cell]));
}

function pill(value: string, locale: AdminLocale) { return <StatusPill value={value} locale={locale} />; }
function external(label: React.ReactNode, href: string) { return <a href={href} target="_blank" rel="noreferrer">{label}</a>; }
function date(value: Date | null, locale: AdminLocale) { return value ? value.toLocaleString(adminDateLocale(locale), { dateStyle: "medium", timeStyle: "short", timeZone: "Pacific/Auckland" }) : "—"; }
function shortDate(value: Date, locale: AdminLocale) { return value.toLocaleDateString(adminDateLocale(locale), { dateStyle: "medium", timeZone: "Pacific/Auckland" }); }
function money(value: number, locale: AdminLocale) { return new Intl.NumberFormat(adminDateLocale(locale), { style: "currency", currency: "NZD" }).format(value / 100); }
function percent(value: number) { return `${Math.round(value * 100)}%`; }
function unique(values: string[]) { return [...new Set(values)]; }
function offset(page: number) { return (page - 1) * pageSize; }
function positiveInteger(value: string | undefined) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : 1; }
function compactUrl(value: string) { try { const url = new URL(value); return `${url.hostname}${url.pathname}`.slice(0, 90); } catch { return value.slice(0, 90); } }

function normalizeLayer(value: string | undefined): ExplorerLayer { return layers.includes(value as ExplorerLayer) ? value as ExplorerLayer : "standard"; }
function datasets(layer: ExplorerLayer): string[] {
  if (layer === "standard") return ["events", "signals", "rates"];
  if (layer === "source") return ["events", "occurrences", "signals"];
  if (layer === "lineage") return ["events", "occurrences", "signals"];
  return [layer === "raw" ? "artifacts" : "targets"];
}
function defaultDataset(layer: ExplorerLayer) { return datasets(layer)[0]; }
function normalizeDataset(layer: ExplorerLayer, value: string | undefined) { return datasets(layer).includes(value ?? "") ? value as string : defaultDataset(layer); }

function explorerHref(input: { layer: ExplorerLayer; dataset: string; source?: string; q?: string; page?: number }) {
  const params = new URLSearchParams({ layer: input.layer, dataset: input.dataset });
  if (input.source) params.set("source", input.source);
  if (input.q) params.set("q", input.q);
  if (input.page && input.page > 1) params.set("page", String(input.page));
  return `/admin/data-explorer?${params}`;
}

function datasetLabel(locale: AdminLocale, layer: ExplorerLayer, dataset: string) {
  const labels = locale === "zh" ? {
    "standard:events": "标准事件场次", "standard:signals": "标准市场信号", "standard:rates": "价格观测",
    "source:events": "来源事件", "source:occurrences": "来源事件场次", "source:signals": "来源市场信号",
    "raw:artifacts": "原始证据", "lineage:events": "事件血缘", "lineage:occurrences": "事件场次血缘", "lineage:signals": "市场信号血缘", "frontier:targets": "抓取目标",
  } : {
    "standard:events": "Canonical event occurrences", "standard:signals": "Canonical market signals", "standard:rates": "Rate observations",
    "source:events": "Source events", "source:occurrences": "Source event occurrences", "source:signals": "Source market signals",
    "raw:artifacts": "Raw evidence", "lineage:events": "Event lineage", "lineage:occurrences": "Occurrence lineage", "lineage:signals": "Signal lineage", "frontier:targets": "Crawl targets",
  };
  return labels[`${layer}:${dataset}` as keyof typeof labels] ?? dataset;
}

function copy(locale: AdminLocale) {
  return locale === "zh" ? {
    title: "数据浏览器", description: "查看非 OTA 采集数据的原始证据、来源记录、标准数据、血缘关系和抓取前沿。", layersLabel: "数据层", datasetsLabel: "数据集",
    layers: { standard: "标准数据", source: "来源数据", raw: "原始证据", lineage: "数据血缘", frontier: "抓取前沿" },
    standardRecords: "标准记录", sourceRecords: "来源记录", rawArtifacts: "原始证据", lineageLinks: "血缘链接", crawlTargets: "抓取目标",
    source: "数据来源", allSources: "全部非 OTA 来源", search: "搜索", searchPlaceholder: "标题、ID、地点、状态或 URL", apply: "应用筛选", reset: "重置",
    total: "共 {count} 条", emptyTitle: "暂无数据", emptyBody: "当前来源和筛选条件下没有记录。", pagination: "数据分页", previous: "上一页", next: "下一页", page: "第 {page} / {total} 页",
    safe: "可查看", deleted: "已删除", yes: "是", no: "否",
  } : {
    title: "Data Explorer", description: "Inspect raw evidence, source records, canonical data, lineage and crawl frontiers for non-OTA collection.", layersLabel: "Data layers", datasetsLabel: "Datasets",
    layers: { standard: "Canonical", source: "Source", raw: "Raw evidence", lineage: "Lineage", frontier: "Crawl frontier" },
    standardRecords: "Canonical records", sourceRecords: "Source records", rawArtifacts: "Raw artifacts", lineageLinks: "Lineage links", crawlTargets: "Crawl targets",
    source: "Data source", allSources: "All non-OTA sources", search: "Search", searchPlaceholder: "Title, ID, location, status or URL", apply: "Apply filters", reset: "Reset",
    total: "{count} total", emptyTitle: "No data", emptyBody: "No records match the selected source and filters.", pagination: "Data pagination", previous: "Previous", next: "Next", page: "Page {page} of {total}",
    safe: "Viewable", deleted: "Deleted", yes: "Yes", no: "No",
  };
}

function explorerLabels(locale: AdminLocale): Record<string, string> {
  if (locale !== "zh") return {};
  return {
    Signal: "信号", Source: "来源", Market: "市场", Region: "地区", Status: "状态", Starts: "开始时间", Ends: "结束时间",
    Property: "房源", Unit: "房型", Listing: "平台房源", Stay: "入住区间", Total: "总价", Availability: "可售状态", Collected: "采集时间",
    Event: "事件", Location: "地点", Category: "分类", Impact: "影响", "External ID": "外部 ID", Occurrences: "场次数", "Canonical links": "标准链接", "Last seen": "最后发现",
    Occurrence: "事件场次", Direction: "方向", Confidence: "置信度", "Canonical link": "标准链接", Artifact: "证据", Type: "类型", "Collection Run": "采集运行",
    Parser: "解析状态", Sensitivity: "敏感性", Created: "创建时间", Expires: "过期时间", "Source record": "来源记录", "Canonical record": "标准记录", "Match method": "匹配方法",
    "Review status": "审核状态", Target: "抓取目标", Kind: "类型", Active: "是否有效", Failures: "失败次数", "Last fetched": "最后抓取", "Next fetch": "下次抓取", "Last error": "最后错误",
  };
}
