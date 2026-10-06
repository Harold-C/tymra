import { randomUUID } from "node:crypto";
import { Prisma } from "@tymra/db";
import { addNzCalendarDays, addNzCalendarMonths, nzDateKey } from "@tymra/domain";
import { AdapterError, type AdapterContext, type PublicRawRecord } from "@tymra/providers/types";
import { AUCKLAND_AIRPORT_MONTHLY_URL, MOT_AIRLINE_PERFORMANCE_URL } from "@tymra/providers/aviation-argus-adapters";
import { extractEventfindaHttpPage, extractTicketmasterHttpPage } from "@tymra/providers/direct-event-page-extractors";
import { SKI_SEASON_SOURCES } from "@tymra/providers/ski-season-adapter";
import { argusPublicMarketSource } from "@tymra/providers/argus-public-market-adapters";
import { isOurAucklandDetailUrl } from "../../../collection/ourauckland-detail-url";
import { isEventfindaDetailUrl, type EventfindaExtraction } from "../../../collection/eventfinda";
import { isTicketmasterDetailUrl, isTicketmasterListingExtraction } from "../../../collection/ticketmaster";
import { RBNZ_FX_URL } from "../../../collection/rbnz-fx";
import { lincolnKeyDatesExtractionSchema, normaliseLincolnKeyDateSignals } from "../../../collection/lincoln-university-key-dates";
import { type ArgusEventSourceId } from "../../../collection/school-sport-ticketek";
import { christchurchCouncilExtractionSchema, councilArgusRawRecords } from "../../../collection/christchurch-council-argus";
import { aucklandAirportExtractionRecords, aucklandAirportMonthlyExtractionSchema, motAirlinePerformanceExtractionRecords, motAirlinePerformanceExtractionSchema } from "../../../collection/aviation-argus-signals";
import { publicSkiSeasonExtractionSchema, skiSeasonArgusRawRecord } from "../../../collection/ski-season-argus";
import { normaliseArgusPublicMarketRecords, officialVenueEventsExtractionSchema, officialVenueResolveExtractionSchema, publicAirportFlightBoardExtractionSchema, publicCruiseScheduleExtractionSchema, publicUniversityKeyDatesExtractionSchema } from "../../../collection/public-market-argus";
import { captureBrowserTaskWithArgus, type ArgusBrowserTaskResult, type ArgusCaptureInput } from "../../../clients/argus-client";
import { captureBrowserTaskWithDurableArgus, durableArgusTraceId, finalizeDirectArgusDelivery } from "../../argus-orchestrator";
import { jsonRecord } from "../helpers";
import type { WorkerContext } from "../context";

export async function executeEventfindaBrowserTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, parentJobId?: string) {
  if (this.directEventPageLoader) {
    return this.executeDirectHttpEventTask(dataSourceId, collectionRunId, url, dryRun, "eventfinda", extractEventfindaHttpPage);
  }
  if (!parentJobId && !dryRun) throw new AdapterError("CONFIGURATION_ERROR", "Eventfinda Argus persistence requires a queued Tymra Job", false);
  const connectorId = "eventfinda-public" as const;
  const workflowId = isEventfindaDetailUrl(url) ? "collect_detail" as const : "collect_listing" as const;
  const traceId = parentJobId
    ? durableArgusTraceId(parentJobId, connectorId, workflowId, url)
    : `eventfinda-${randomUUID()}`;
  const input = { traceId, url, connectorId, workflowId };
  const response = parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, input);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) {
    if (!parentJobId && response.delivery) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, false);
    throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  }
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
  if (!dryRun && result.status !== "success") await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "eventfinda", url);
  if (result.status !== "success" && !parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "Eventfinda presented an access challenge; collection stopped without bypassing it", true);
  if (result.status !== "success") {
    const category = result.error?.category.toUpperCase();
    throw new AdapterError(category === "TIMEOUT" ? "TIMEOUT" : category === "ARTIFACT_TOO_LARGE" ? "ARTIFACT_TOO_LARGE" : "SOURCE_UNAVAILABLE", result.error?.message ?? "Eventfinda Argus capture failed", category === "ARTIFACT_TOO_LARGE" ? false : result.error?.retryable ?? true);
  }
  const extraction = result.extracted as EventfindaExtraction | null;
  if (!extraction || extraction.extractor !== "eventfinda"
    || extraction.kind !== (workflowId === "collect_listing" ? "listing" : "event_detail")
    || (extraction.kind === "listing" && extraction.events.length === 0)
    || (extraction.kind === "event_detail" && extraction.occurrences.length === 0)) {
    throw new AdapterError("PARSING_ERROR", "Eventfinda Argus capture returned an empty or invalid page", false);
  }
  if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "eventfinda", url);
  if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  return result;
}

export async function executeOurAucklandBrowserTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, url: string, maxRecords: number, dryRun: boolean, parentJobId?: string): Promise<PublicRawRecord[]> {
  const connectorId = "ourauckland-public" as const;
  const capture = async (targetUrl: string, workflowId: "collect_listing" | "collect_detail", boundedRecords?: number) => {
    const traceId = parentJobId
      ? durableArgusTraceId(parentJobId, connectorId, workflowId, targetUrl)
      : `ourauckland-${randomUUID()}`;
    const input = { traceId, url: targetUrl, connectorId, workflowId, ...(boundedRecords === undefined ? {} : { maxRecords: boundedRecords }) };
    const response = parentJobId
      ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
      : await captureBrowserTaskWithArgus(this.environment, input);
    if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
    if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
    const result = response.payload;
    if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) {
      throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
    }
    if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "ourauckland", targetUrl);
    if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
    if (result.status === "manual_required") {
      throw new AdapterError("SOURCE_UNAVAILABLE", "OurAuckland presented an access challenge; collection stopped without bypassing it", true);
    }
    if (result.status !== "success") {
      throw new AdapterError(
        result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE",
        result.error?.message ?? "OurAuckland Argus capture failed",
        result.error?.retryable ?? true,
      );
    }
    return result;
  };

  const listingResult = await capture(url, "collect_listing", maxRecords);
  const extraction = jsonRecord(listingResult.extracted as Prisma.JsonValue);
  const candidates = Array.isArray(extraction.events)
    ? extraction.events.filter((value): value is Prisma.JsonObject => Boolean(value) && typeof value === "object" && !Array.isArray(value))
    : [];
  if (candidates.length === 0) throw new AdapterError("PARSING_ERROR", "OurAuckland Argus listing returned no event cards", false);
  const records: PublicRawRecord[] = [];
  for (const event of candidates.filter((candidate) =>
    typeof candidate.sourceUrl === "string" && isOurAucklandDetailUrl(candidate.sourceUrl)).slice(0, maxRecords)) {
    const externalId = typeof event.id === "string" ? event.id : "";
    const sourceUrl = typeof event.sourceUrl === "string" ? event.sourceUrl : "";
    if (!externalId || !sourceUrl) continue;
    const detailResult = await capture(sourceUrl, "collect_detail");
    const detail = jsonRecord(detailResult.extracted as Prisma.JsonValue);
    if (detail.kind !== "event_detail" || detail.id !== externalId) {
      if (!dryRun) await this.markArgusEvidenceParserFailure(collectionRunId, detailResult.traceId);
      throw new AdapterError("PARSING_ERROR", `OurAuckland detail returned an invalid payload for ${sourceUrl}`, false);
    }
    records.push({
      sourceId: "council_calendars",
      externalId,
      payload: {
        provider: "Auckland Council / OurAuckland",
        event: detail,
        listing: event,
        page: typeof extraction.currentPage === "number" ? extraction.currentPage : 1,
      },
      fetchedAt: new Date(),
      fixture: false,
      networkRequestCount: 0,
    });
  }
  if (records.length === 0) throw new AdapterError("PARSING_ERROR", "OurAuckland Argus capture returned no event details", false);
  records[0]!.networkRequestCount = 1 + records.length;
  return records;
}

export async function executeTicketmasterBrowserTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, parentJobId?: string, entryUrl?: string) {
  if (this.directEventPageLoader && !isTicketmasterDetailUrl(url)) {
    return this.executeDirectHttpEventTask(dataSourceId, collectionRunId, url, dryRun, "ticketmaster", extractTicketmasterHttpPage);
  }
  if (!parentJobId && !dryRun && !this.directEventPageLoader) throw new AdapterError("CONFIGURATION_ERROR", "Ticketmaster Argus persistence requires a queued Tymra Job", false);
  const connectorId = "ticketmaster-public" as const;
  const workflowId = isTicketmasterDetailUrl(url) ? "collect_detail" as const : "collect_listing" as const;
  if (workflowId === "collect_detail" && !entryUrl) throw new AdapterError("PARSING_ERROR", "Ticketmaster detail capture requires its discovery entry URL", false);
  const traceId = parentJobId
    ? durableArgusTraceId(parentJobId, connectorId, workflowId, url)
    : `ticketmaster-${randomUUID()}`;
  const input = { traceId, url, ...(entryUrl ? { entryUrl } : {}), connectorId, workflowId,
    ...(workflowId === "collect_listing" ? { maxRecords: 500 } : {}) };
  const response = parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, input);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) {
    if (!parentJobId && response.delivery) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, false);
    throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  }
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
  if (!dryRun && result.status !== "success") await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "ticketmaster", url);
  if (result.status !== "success" && !parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "Ticketmaster presented an access challenge; collection stopped without bypassing it", true);
  if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? "Ticketmaster Argus capture failed", result.error?.retryable ?? true);
  const extraction = result.extracted;
  if (workflowId === "collect_listing" && (!isTicketmasterListingExtraction(extraction)
    || extraction.events.length === 0 || (extraction as Record<string, unknown>).truncated === true)) {
    throw new AdapterError("PARSING_ERROR", "Ticketmaster Argus listing is empty, truncated or invalid", false);
  }
  if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "ticketmaster", url);
  if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  return result;
}

export async function executeDirectHttpEventTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, extractor: "eventfinda" | "ticketmaster", parse: (input: { html: string; title: string; finalUrl: string }) => unknown): Promise<ArgusBrowserTaskResult> {
  const traceId = `http-${extractor}-${randomUUID()}`;
  const loaded = await this.loadDirectEventPage(extractor, url);
  const html = loaded.html;
  const finalUrl = loaded.finalUrl ?? url;
  if (Buffer.byteLength(html) > 5_000_000) throw new AdapterError("PARSING_ERROR", `${extractor} response exceeds the 5 MB limit`, false);
  let extracted: unknown;
  try {
    extracted = parse({ html, title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? "", finalUrl });
  } catch (error) {
    if (!dryRun) await this.persistDirectHttpEvidence(dataSourceId, collectionRunId, traceId, extractor, url, finalUrl, html, true);
    throw new AdapterError("PARSING_ERROR", `${extractor} parser failed: ${error instanceof Error ? error.message : "unknown error"}`, false);
  }
  if (!dryRun) await this.persistDirectHttpEvidence(dataSourceId, collectionRunId, traceId, extractor, url, finalUrl, html, false);
  return {
    ok: true,
    status: "success",
    traceId,
    taskType: "read_only_capture",
    page: { title: "", finalUrl, htmlBytes: Buffer.byteLength(html), screenshotBytes: 0 },
    evidence: [],
    error: null,
    manualRequired: null,
    readonlyOnly: true,
    externalSideEffectsPerformed: false,
    extracted,
  };
}

export async function loadDirectEventPage(this: WorkerContext, source: "eventfinda" | "ticketmaster", url: string) {
  if (!this.directEventPageLoader) throw new AdapterError("CONFIGURATION_ERROR", "Direct event page loading is available only through an explicit test fixture", false);
  return this.directEventPageLoader({ source, url });
}

export async function executeRbnzFxBrowserTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, dryRun: boolean, parentJobId?: string) {
  const connectorId = "rbnz-fx" as const;
  const workflowId = "collect_exchange_rates" as const;
  const traceId = parentJobId
    ? durableArgusTraceId(parentJobId, connectorId, workflowId, RBNZ_FX_URL)
    : `rbnz-fx-${randomUUID()}`;
  const input = { traceId, url: RBNZ_FX_URL, connectorId, workflowId };
  const response = parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, input);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
  if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "rbnz-fx", RBNZ_FX_URL);
  if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "RBNZ presented an access challenge; collection stopped without bypassing it", true);
  if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? "RBNZ Argus capture failed", result.error?.retryable ?? true);
  return result;
}

export async function executeSkiSeasonArgusTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, url: string, context: AdapterContext, dryRun: boolean, parentJobId?: string): Promise<PublicRawRecord[]> {
  if (!SKI_SEASON_SOURCES.some((source) => source.url === url)) {
    throw new AdapterError("INVALID_INPUT", "Ski season reference is outside the three approved official pages", false);
  }
  const connectorId = "nz-ski-season-public" as const;
  const workflowId = "collect_season" as const;
  const seasonYear = Number(nzDateKey(context.collectionRange?.from ?? new Date()).slice(0, 4));
  const traceId = parentJobId
    ? durableArgusTraceId(parentJobId, connectorId, workflowId, url)
    : `nz-ski-season-${randomUUID()}`;
  const input: ArgusCaptureInput = { traceId, url, connectorId, workflowId, seasonYear, maxAttempts: 1 };
  const response = parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, input);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) {
    throw new AdapterError("PARSING_ERROR", "Argus ski capture violated the read-only result contract", false);
  }
  if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, connectorId, url);
  if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  if (result.status === "manual_required") {
    throw new AdapterError("RATE_LIMITED", "An official ski page presented an access challenge; collection stopped", true);
  }
  if (result.status !== "success") {
    throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE",
      result.error?.message ?? "Argus ski season capture failed", result.error?.retryable ?? true);
  }
  const parsed = publicSkiSeasonExtractionSchema.safeParse(result.extracted);
  if (!parsed.success || parsed.data.sourceUrl !== url || parsed.data.seasonYear !== seasonYear) {
    if (!dryRun) await this.markArgusEvidenceParserFailure(collectionRunId, result.traceId);
    throw new AdapterError("PARSING_ERROR", "Argus ski season result failed its fixed source and year contract", false);
  }
  return [skiSeasonArgusRawRecord(parsed.data)];
}

export async function executeAviationArgusTask(this: WorkerContext, sourceId: "auckland_airport_monthly" | "mot_airline_performance", dataSourceId: string, collectionRunId: string, url: string, context: AdapterContext, dryRun: boolean, parentJobId?: string): Promise<PublicRawRecord[]> {
  const config = sourceId === "auckland_airport_monthly"
    ? { connectorId: "auckland-airport-monthly" as const, workflowId: "collect_monthly_traffic" as const, expectedUrl: AUCKLAND_AIRPORT_MONTHLY_URL }
    : { connectorId: "mot-airline-performance" as const, workflowId: "collect_monthly_performance" as const, expectedUrl: MOT_AIRLINE_PERFORMANCE_URL };
  if (url !== config.expectedUrl) throw new AdapterError("INVALID_INPUT", `${sourceId} received an unexpected source URL`, false);
  const traceId = parentJobId
    ? durableArgusTraceId(parentJobId, config.connectorId, config.workflowId, url)
    : `${sourceId}-${randomUUID()}`;
  const input = {
    traceId,
    url,
    connectorId: config.connectorId,
    workflowId: config.workflowId,
    startDate: context.collectionRange?.from.toISOString(),
    endDate: context.collectionRange?.to.toISOString(),
    maxRecords: context.collectionLimits?.maxRecords,
  };
  const response = parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, input);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
  if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, config.connectorId, url);
  if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", `${sourceId} presented an access challenge; collection stopped without bypassing it`, true);
  if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? `${sourceId} Argus capture failed`, result.error?.retryable ?? true);
  const parsed = sourceId === "auckland_airport_monthly"
    ? aucklandAirportMonthlyExtractionSchema.safeParse(result.extracted)
    : motAirlinePerformanceExtractionSchema.safeParse(result.extracted);
  if (!parsed.success) {
    if (!dryRun) await this.markArgusEvidenceParserFailure(collectionRunId, result.traceId);
    throw new AdapterError("PARSING_ERROR", `${sourceId} extractor returned an invalid payload: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
  }
  return sourceId === "auckland_airport_monthly"
    ? aucklandAirportExtractionRecords(parsed.data as ReturnType<typeof aucklandAirportMonthlyExtractionSchema.parse>)
    : motAirlinePerformanceExtractionRecords(parsed.data as ReturnType<typeof motAirlinePerformanceExtractionSchema.parse>);
}

export async function executePublicMarketArgusTask(this: WorkerContext, sourceId: string, dataSourceId: string, collectionRunId: string, context: AdapterContext, dryRun: boolean, parentJobId?: string): Promise<PublicRawRecord[]> {
  const definition = argusPublicMarketSource(sourceId);
  if (!definition) throw new AdapterError("CONFIGURATION_ERROR", `${sourceId} is not an Argus public-market source`, false);
  const capture = async (input: Omit<ArgusCaptureInput, "traceId" | "connectorId">) => {
    const connectorId = definition.connectorId as ArgusCaptureInput["connectorId"];
    const traceId = parentJobId
      ? durableArgusTraceId(parentJobId, connectorId, input.workflowId, input.url)
      : `${sourceId}-${input.workflowId}-${randomUUID()}`;
    const captureInput: ArgusCaptureInput = { ...input, traceId, connectorId };
    const response = parentJobId
      ? await captureBrowserTaskWithDurableArgus(this.environment, captureInput, { parentJobId, collectionRunId, dataSourceId })
      : await captureBrowserTaskWithArgus(this.environment, captureInput);
    if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
    if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
    const result = response.payload;
    if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
    if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, definition.connectorId, input.url);
    if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
    if (result.status === "manual_required") {
      const handoff = result.manualRequired?.noVncUrl ? "; a same-session noVNC handoff is available" : "";
      throw new AdapterError("RATE_LIMITED", `${definition.sourceName} presented ${result.manualRequired?.reason ?? "an access challenge"}${handoff}`, true);
    }
    if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? `${definition.sourceName} Argus capture failed`, result.error?.retryable ?? true);
    return result;
  };

  const maxRecords = Math.min(context.collectionLimits?.maxRecords ?? 200, definition.kind === "venue" ? 200 : 500);
  if (definition.kind === "venue") {
    const resolvedResult = await capture({ url: definition.url, workflowId: "resolve_venue", maxRecords });
    const resolved = officialVenueResolveExtractionSchema.parse(resolvedResult.extracted);
    const eventsResult = await capture({ url: definition.eventUrl!, workflowId: "collect_events", maxRecords });
    const events = officialVenueEventsExtractionSchema.parse(eventsResult.extracted);
    if (resolved.provider !== definition.connectorId || events.provider !== definition.connectorId || events.venueId !== resolved.venueId) throw new AdapterError("PARSING_ERROR", `${definition.sourceName} identity drifted between venue and event workflows`, false);
    return normaliseArgusPublicMarketRecords(sourceId, events, resolved);
  }
  if (definition.kind === "cruise") {
    const from = context.collectionRange?.from ?? new Date();
    const fromDate = nzDateKey(from);
    const requestedToDate = context.collectionRange?.to ? nzDateKey(context.collectionRange.to) : addNzCalendarDays(fromDate, 365);
    const maxToDate = addNzCalendarMonths(fromDate, 18);
    const result = await capture({ url: definition.url, workflowId: "collect_cruise_schedule", from: fromDate, to: requestedToDate < maxToDate ? requestedToDate : maxToDate, maxRecords });
    return normaliseArgusPublicMarketRecords(sourceId, publicCruiseScheduleExtractionSchema.parse(result.extracted));
  }
  if (definition.kind === "airport") {
    const from = context.collectionRange?.from ?? new Date();
    const requestedTo = context.collectionRange?.to ?? new Date(from.getTime() + 48 * 3_600_000);
    const to = new Date(Math.min(requestedTo.getTime(), from.getTime() + 48 * 3_600_000));
    const result = await capture({ url: definition.url, workflowId: "collect_flights", from: from.toISOString(), to: to.toISOString(), maxRecords });
    return normaliseArgusPublicMarketRecords(sourceId, publicAirportFlightBoardExtractionSchema.parse(result.extracted));
  }
  const academicYear = Number(nzDateKey(context.collectionRange?.from ?? new Date()).slice(0, 4));
  const result = await capture({ url: definition.url, workflowId: "collect_key_dates", academicYear, maxRecords });
  return normaliseArgusPublicMarketRecords(sourceId, publicUniversityKeyDatesExtractionSchema.parse(result.extracted));
}

export async function executeLincolnKeyDatesBrowserTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, url: string, context: AdapterContext, dryRun: boolean, parentJobId?: string): Promise<PublicRawRecord[]> {
  const connectorId = "lincoln-university-key-dates" as const;
  const workflowId = "collect_key_dates" as const;
  const traceId = parentJobId
    ? durableArgusTraceId(parentJobId, connectorId, workflowId, url)
    : `lincoln-key-dates-${randomUUID()}`;
  const academicYear = Number(new URL(url).pathname.match(/^\/study\/key-dates\/(20\d{2})-academic-key-dates\/$/u)?.[1]);
  if (!Number.isInteger(academicYear)) throw new AdapterError("INVALID_INPUT", "Lincoln academic year does not match the approved annual URL", false);
  const input = { traceId, url, connectorId, workflowId, academicYear };
  const response = parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, input, { parentJobId, collectionRunId, dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, input);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
  if (!dryRun) await this.persistArgusEvidence(dataSourceId, collectionRunId, result, "lincoln-university-key-dates", url);
  if (!parentJobId) await finalizeDirectArgusDelivery(this.environment, collectionRunId, response.delivery, !dryRun);
  if (result.status === "manual_required") throw new AdapterError("RATE_LIMITED", "Lincoln University presented an access challenge; collection stopped without bypassing it", true);
  if (result.status !== "success") throw new AdapterError(result.error?.category.toUpperCase() === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? "Lincoln University Argus capture failed", result.error?.retryable ?? true);
  const parsed = lincolnKeyDatesExtractionSchema.safeParse(result.extracted);
  if (!parsed.success) {
    if (!dryRun) await this.markArgusEvidenceParserFailure(collectionRunId, result.traceId);
    throw new AdapterError("PARSING_ERROR", `Lincoln University extractor returned an invalid payload: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
  }
  if (parsed.data.academicYear !== academicYear) throw new AdapterError("PARSING_ERROR", "Lincoln University returned a different academic year", false);
  const range = context.collectionRange ?? { from: new Date(0), to: new Date(8_640_000_000_000_000) };
  const signals = normaliseLincolnKeyDateSignals(parsed.data, range, context.collectionLimits?.maxRecords);
  return signals.map((signal, index) => ({
    sourceId: "christchurch_university_dates",
    externalId: signal.externalId,
    payload: {
      kind: "signal",
      value: signal,
      sourceUrl: url,
      connectorData: {
        data_schema: parsed.data.data_schema,
        schema_version: parsed.data.schema_version,
        institution: parsed.data.institution,
        academicYear: parsed.data.academicYear,
        canonicalUrl: parsed.data.canonicalUrl,
        quality: parsed.data.quality,
        keyDate: parsed.data.keyDates.find((keyDate) => keyDate.id === signal.externalId),
      },
    },
    fetchedAt: new Date(),
    fixture: false,
    networkRequestCount: index === 0 ? 1 : 0,
  }));
}

export async function executeCouncilArgusTask(this: WorkerContext, dataSourceId: string, collectionRunId: string, reference: string, context: AdapterContext, dryRun: boolean, parentJobId?: string): Promise<PublicRawRecord[]> {
  if (!context.collectionRange || reference !== "https://www.ccc.govt.nz/news-and-events/whats-on") {
    throw new AdapterError("PARSING_ERROR", "Council browser task requires the approved listing and a bounded date range", false);
  }
  const capture = await this.executePriorityArgusEventTask({
    sourceId: "christchurch_council_events",
    dataSourceId,
    collectionRunId,
    connectorId: "christchurch-council-events",
    workflowId: "collect_events",
    url: reference,
    maxPages: Math.min(3, context.collectionLimits?.maxRequests ?? 3),
    dryRun,
    parentJobId,
  });
  const parsed = christchurchCouncilExtractionSchema.safeParse(capture.extracted);
  if (!parsed.success) {
    if (!dryRun) await this.markArgusEvidenceParserFailure(collectionRunId, capture.traceId);
    throw new AdapterError("PARSING_ERROR", `Council browser result is invalid: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`, false);
  }
  try {
    return councilArgusRawRecords(parsed.data, context.collectionRange, context.collectionLimits?.maxRecords ?? 2);
  } catch (error) {
    if (!dryRun) await this.markArgusEvidenceParserFailure(collectionRunId, capture.traceId);
    throw error;
  }
}

export async function executePriorityArgusEventTask(this: WorkerContext, input: {
  sourceId: ArgusEventSourceId | "christchurch_council_events";
  dataSourceId: string;
  collectionRunId: string;
  connectorId: "sporty-school-sport-public" | "ticketek-public" | "dunedinnz-public" | "christchurch-council-events";
  workflowId: "collect_events" | "collect_listing" | "collect_detail";
  url: string;
  entryUrl?: string;
  startDate?: string;
  endDate?: string;
  maxRecords?: number;
  maxPages?: number;
  dryRun: boolean;
  parentJobId?: string;
}): Promise<ArgusBrowserTaskResult> {
  const traceId = input.parentJobId
    ? durableArgusTraceId(input.parentJobId, input.connectorId, input.workflowId, input.url)
    : `${input.sourceId}-${randomUUID()}`;
  const captureInput = {
    traceId,
    connectorId: input.connectorId,
    workflowId: input.workflowId,
    url: input.url,
    ...(input.entryUrl === undefined ? {} : { entryUrl: input.entryUrl }),
    ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
    ...(input.endDate === undefined ? {} : { endDate: input.endDate }),
    ...(input.maxRecords === undefined ? {} : { maxRecords: input.maxRecords }),
    ...(input.maxPages === undefined ? {} : { maxPages: input.maxPages }),
  };
  const response = input.parentJobId
    ? await captureBrowserTaskWithDurableArgus(this.environment, captureInput, { parentJobId: input.parentJobId, collectionRunId: input.collectionRunId, dataSourceId: input.dataSourceId })
    : await captureBrowserTaskWithArgus(this.environment, captureInput);
  if (response.httpStatus === 429) throw new AdapterError("RATE_LIMITED", "Argus concurrency limit was reached", true);
  if (!response.ok) throw new AdapterError(response.httpStatus === 504 ? "TIMEOUT" : "SOURCE_UNAVAILABLE", response.message, response.httpStatus >= 500);
  const result = response.payload;
  if (result.externalSideEffectsPerformed !== false || result.readonlyOnly !== true) {
    throw new AdapterError("PARSING_ERROR", "Argus capture violated the read-only result contract", false);
  }
  if (!input.dryRun) await this.persistArgusEvidence(input.dataSourceId, input.collectionRunId, result, input.connectorId, input.url);
  if (!input.parentJobId) await finalizeDirectArgusDelivery(this.environment, input.collectionRunId, response.delivery, !input.dryRun);
  if (result.status === "manual_required") {
    throw new AdapterError("RATE_LIMITED", `${input.sourceId} presented an access challenge; collection stopped without bypassing it`, true);
  }
  if (result.status !== "success") {
    const category = result.error?.category.toUpperCase();
    throw new AdapterError(category === "TIMEOUT" ? "TIMEOUT" : "SOURCE_UNAVAILABLE", result.error?.message ?? `${input.sourceId} Argus capture failed`, result.error?.retryable ?? true);
  }
  return result;
}
