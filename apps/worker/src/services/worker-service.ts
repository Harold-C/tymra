import * as requests from "./worker/requests";
import * as pricing from "./worker/pricing";
import * as collection_coordinator from "./worker/collection/coordinator";
import * as collection_eventfinda from "./worker/collection/eventfinda";
import * as collection_ticketmaster from "./worker/collection/ticketmaster";
import * as collection_regional_events from "./worker/collection/regional-events";
import * as collection_browser_connectors from "./worker/collection/browser-connectors";
import * as collection_persistence from "./worker/collection/persistence";
import * as catalog from "./worker/catalog";
import * as operations from "./worker/operations";
import type { WorkerContext } from "./worker/context";
import type { CreateWorkerRequest, ConfirmWorkerRequest, CollectSourceOptions, ConfigureSourceSchedulesRequest, DirectEventPageLoader, EventPersistenceCache } from "./worker/contracts";
import { randomUUID } from "node:crypto";
import { getEnvironment, type Environment } from "@tymra/config";
import { enqueueJob, prisma, Prisma, type WorkerAnalysisRequest, type WorkerAnalysisStatus } from "@tymra/db";
import { otaProviderDetails } from "@tymra/providers/ota-argus-contracts";
import { parseOtaListingReference } from "@tymra/providers/ota-adapters";
import { publicDataAdapters } from "@tymra/providers/public/registry";
import { type AdapterContext, type PublicDataAdapter, type PublicEvent, type PublicRawRecord, type PublicSignal } from "@tymra/providers/types";
import { type ArgusEventSourceId } from "../collection/school-sport-ticketek";
import { type ArgusBrowserTaskResult } from "../clients/argus-client";
import { type SourceAccessState } from "../operations/source-access";

export { WorkerRequestError } from "./worker/errors";

/** Coordinates typed business modules over the selected runtime. */
export class WorkerService {
  constructor(
    private readonly environment: Environment = getEnvironment(),
    private readonly publicAdapters: Record<string, PublicDataAdapter> = publicDataAdapters,
    private readonly directEventPageLoader?: DirectEventPageLoader,
  ) {}

  private workerContext?: WorkerContext;

  private get context(): WorkerContext {
    return this.workerContext ??= {
      environment: this.environment, publicAdapters: this.publicAdapters, directEventPageLoader: this.directEventPageLoader,
      createPreview: (...args) => this.createPreview(...args),
      createFormalAnalysis: (...args) => this.createFormalAnalysis(...args),
      validatePriceCheckOtaListing: (...args) => this.validatePriceCheckOtaListing(...args),
      validateFixturePriceCheckListing: (...args) => this.validateFixturePriceCheckListing(...args),
      markOtaListingSourceUnavailable: (...args) => this.markOtaListingSourceUnavailable(...args),
      markOtaListingConflict: (...args) => this.markOtaListingConflict(...args),
      collectPriceCheckOtaRate: (...args) => this.collectPriceCheckOtaRate(...args),
      discoverAndCollectPriceCheckComparables: (...args) => this.discoverAndCollectPriceCheckComparables(...args),
      confirmAnalysis: (...args) => this.confirmAnalysis(...args),
      getAnalysis: (...args) => this.getAnalysis(...args),
      getResult: (...args) => this.getResult(...args),
      cancelAnalysis: (...args) => this.cancelAnalysis(...args),
      resendResultNotification: (...args) => this.resendResultNotification(...args),
      collectAnalysis: (...args) => this.collectAnalysis(...args),
      buildCompetitorSet: (...args) => this.buildCompetitorSet(...args),
      buildSnapshots: (...args) => this.buildSnapshots(...args),
      analyseSnapshot: (...args) => this.analyseSnapshot(...args),
      collectSource: (...args) => this.collectSource(...args),
      assertLocalAcceptanceAllowed: (...args) => this.assertLocalAcceptanceAllowed(...args),
      assertSourceCollectionAllowed: (...args) => this.assertSourceCollectionAllowed(...args),
      metServiceCollectionState: (...args) => this.metServiceCollectionState(...args),
      previousChristchurchScan: (...args) => this.previousChristchurchScan(...args),
      persistNormalisedSignal: (...args) => this.persistNormalisedSignal(...args),
      resumeOrCreateBrowserCollectionRun: (...args) => this.resumeOrCreateBrowserCollectionRun(...args),
      collectArgusEventSource: (...args) => this.collectArgusEventSource(...args),
      collectRbnzFxSource: (...args) => this.collectRbnzFxSource(...args),
      collectTicketmasterSource: (...args) => this.collectTicketmasterSource(...args),
      assertTicketmasterSourceAllowed: (...args) => this.assertTicketmasterSourceAllowed(...args),
      collectEventfindaSource: (...args) => this.collectEventfindaSource(...args),
      assertEventfindaSourceAllowed: (...args) => this.assertEventfindaSourceAllowed(...args),
      executeEventfindaBrowserTask: (...args) => this.executeEventfindaBrowserTask(...args),
      executeOurAucklandBrowserTask: (...args) => this.executeOurAucklandBrowserTask(...args),
      executeTicketmasterBrowserTask: (...args) => this.executeTicketmasterBrowserTask(...args),
      executeDirectHttpEventTask: (...args) => this.executeDirectHttpEventTask(...args),
      loadDirectEventPage: (...args) => this.loadDirectEventPage(...args),
      persistDirectHttpEvidence: (...args) => this.persistDirectHttpEvidence(...args),
      executeRbnzFxBrowserTask: (...args) => this.executeRbnzFxBrowserTask(...args),
      executeSkiSeasonArgusTask: (...args) => this.executeSkiSeasonArgusTask(...args),
      executeAviationArgusTask: (...args) => this.executeAviationArgusTask(...args),
      executePublicMarketArgusTask: (...args) => this.executePublicMarketArgusTask(...args),
      executeLincolnKeyDatesBrowserTask: (...args) => this.executeLincolnKeyDatesBrowserTask(...args),
      executeCouncilArgusTask: (...args) => this.executeCouncilArgusTask(...args),
      executePriorityArgusEventTask: (...args) => this.executePriorityArgusEventTask(...args),
      persistArgusConnectorPayload: (...args) => this.persistArgusConnectorPayload(...args),
      persistArgusEvidence: (...args) => this.persistArgusEvidence(...args),
      markArgusEvidenceParserFailure: (...args) => this.markArgusEvidenceParserFailure(...args),
      argusHealth: (...args) => this.argusHealth(...args),
      syncCollectionIncidentSafely: (...args) => this.syncCollectionIncidentSafely(...args),
      sourceHealth: (...args) => this.sourceHealth(...args),
      otaHealth: (...args) => this.otaHealth(...args),
      retentionCleanup: (...args) => this.retentionCleanup(...args),
      activateSource: (...args) => this.activateSource(...args),
      collectProductionOta: (...args) => this.collectProductionOta(...args),
      refreshCatalog: (...args) => this.refreshCatalog(...args),
      refreshPanel: (...args) => this.refreshPanel(...args),
      collectPanelMemberRate: (...args) => this.collectPanelMemberRate(...args),
      refreshOtaMarketSignals: (...args) => this.refreshOtaMarketSignals(...args),
      suspendSource: (...args) => this.suspendSource(...args),
      sourceSchedulePlan: (...args) => this.sourceSchedulePlan(...args),
      configureSourceSchedules: (...args) => this.configureSourceSchedules(...args),
      enqueueOperationalJob: (...args) => this.enqueueOperationalJob(...args),
      health: (...args) => this.health(...args),
      createRequest: (...args) => this.createRequest(...args),
      resolveAndPersistInput: (...args) => this.resolveAndPersistInput(...args),
      createBackingPriceCheck: (...args) => this.createBackingPriceCheck(...args),
      ensureQueryPlan: (...args) => this.ensureQueryPlan(...args),
      enqueueCollection: (...args) => this.enqueueCollection(...args),
      enqueueWorkerJob: (...args) => this.enqueueWorkerJob(...args),
      requireReadyIdentity: (...args) => this.requireReadyIdentity(...args),
      setStatus: (...args) => this.setStatus(...args),
      failBusiness: (...args) => this.failBusiness(...args),
      requireFixtureSource: (...args) => this.requireFixtureSource(...args),
      ensureCollectionProfile: (...args) => this.ensureCollectionProfile(...args),
      ensureFixtureCompetitors: (...args) => this.ensureFixtureCompetitors(...args),
      ensureStayQueryForDate: (...args) => this.ensureStayQueryForDate(...args),
      analysisObservationIds: (...args) => this.analysisObservationIds(...args),
      collectPublicSignals: (...args) => this.collectPublicSignals(...args),
      publishFormalResult: (...args) => this.publishFormalResult(...args),
      publishObservedOnlyResult: (...args) => this.publishObservedOnlyResult(...args),
      enforceWorkerLimits: (...args) => this.enforceWorkerLimits(...args),
      recordWorkerUsage: (...args) => this.recordWorkerUsage(...args),
      recordAbuseDecision: (...args) => this.recordAbuseDecision(...args),
      adapterContext: (...args) => this.adapterContext(...args),
      publicAdapterContext: (...args) => this.publicAdapterContext(...args),
      persistNormalisedEvent: (...args) => this.persistNormalisedEvent(...args),
      persistNormalisedEvents: (...args) => this.persistNormalisedEvents(...args),
      persistEventSignals: (...args) => this.persistEventSignals(...args),
      persistNormalisedEventCached: (...args) => this.persistNormalisedEventCached(...args),
      reconcileCanonicalEventImpact: (...args) => this.reconcileCanonicalEventImpact(...args),
      fixtureEnabled: (...args) => this.fixtureEnabled(...args),
    };
  }

  async createPreview(input: CreateWorkerRequest) {
    return requests.createPreview.call(this.context, input);
  }

  async createFormalAnalysis(input: CreateWorkerRequest) {
    return requests.createFormalAnalysis.call(this.context, input);
  }

  async validatePriceCheckOtaListing(priceCheckId: string, parentJobId: string) {
    return pricing.validatePriceCheckOtaListing.call(this.context, priceCheckId, parentJobId);
  }

  private async validateFixturePriceCheckListing(
    check: { id: string; propertyId: string | null; listingUrl: string | null },
    reference: ReturnType<typeof parseOtaListingReference>,
    provider: NonNullable<ReturnType<typeof otaProviderDetails>>,
    parentJobId: string,
  ) {
    return pricing.validateFixturePriceCheckListing.call(this.context, check, reference, provider, parentJobId);
  }

  private async markOtaListingSourceUnavailable(priceCheckId: string, message: string) {
    return pricing.markOtaListingSourceUnavailable.call(this.context, priceCheckId, message);
  }

  private async markOtaListingConflict(priceCheckId: string, collectionRunId: string, message: string, reasons: string[], errorCode = "LISTING_ADDRESS_CONFLICT") {
    return pricing.markOtaListingConflict.call(this.context, priceCheckId, collectionRunId, message, reasons, errorCode);
  }

  async collectPriceCheckOtaRate(priceCheckId: string, parentJobId: string) {
    return pricing.collectPriceCheckOtaRate.call(this.context, priceCheckId, parentJobId);
  }

  async discoverAndCollectPriceCheckComparables(priceCheckId: string, parentJobId: string) {
    return pricing.discoverAndCollectPriceCheckComparables.call(this.context, priceCheckId, parentJobId);
  }

  async confirmAnalysis(analysisRequestId: string, input: ConfirmWorkerRequest) {
    return requests.confirmAnalysis.call(this.context, analysisRequestId, input);
  }

  async getAnalysis(id: string) {
    return requests.getAnalysis.call(this.context, id);
  }

  async getResult(id: string) {
    return requests.getResult.call(this.context, id);
  }

  async cancelAnalysis(id: string) {
    return requests.cancelAnalysis.call(this.context, id);
  }

  async resendResultNotification(id: string) {
    return requests.resendResultNotification.call(this.context, id);
  }

  async collectAnalysis(analysisRequestId: string, jobId: string) {
    return pricing.collectAnalysis.call(this.context, analysisRequestId, jobId);
  }

  async buildCompetitorSet(analysisRequestId: string, jobId: string) {
    return pricing.buildCompetitorSet.call(this.context, analysisRequestId, jobId);
  }

  async buildSnapshots(analysisRequestId: string, jobId: string) {
    return pricing.buildSnapshots.call(this.context, analysisRequestId, jobId);
  }

  async analyseSnapshot(analysisRequestId: string, jobId: string) {
    return pricing.analyseSnapshot.call(this.context, analysisRequestId, jobId);
  }

  async collectSource(sourceId: string, marketScope = "new-zealand", analysisRequestId?: string, options: CollectSourceOptions = {}) {
    return collection_coordinator.collectSource.call(this.context, sourceId, marketScope, analysisRequestId, options);
  }

  private assertLocalAcceptanceAllowed(
    source: { name: string; enabled: boolean; environments: string[]; operationalStatus: string },
    localAcceptance: boolean,
  ) {
    return collection_coordinator.assertLocalAcceptanceAllowed.call(this.context, source, localAcceptance);
  }

  private assertSourceCollectionAllowed(
    source: SourceAccessState & { name: string },
    allowDegradedInProduction = false,
  ) {
    return collection_coordinator.assertSourceCollectionAllowed.call(this.context, source, allowDegradedInProduction);
  }

  private async metServiceCollectionState(dataSourceId: string): Promise<NonNullable<AdapterContext["collectionState"]>> {
    return collection_coordinator.metServiceCollectionState.call(this.context, dataSourceId);
  }

  private async previousChristchurchScan(dataSourceId: string): Promise<NonNullable<AdapterContext["christchurchScan"]>> {
    return collection_coordinator.previousChristchurchScan.call(this.context, dataSourceId);
  }

  private async persistNormalisedSignal(
    signal: PublicSignal,
    dataSourceId: string,
    collectionRunId: string,
    defaultMarketKey: string,
    eventOccurrenceId?: string,
  ) {
    return collection_persistence.persistNormalisedSignal.call(this.context, signal, dataSourceId, collectionRunId, defaultMarketKey, eventOccurrenceId);
  }

  private async resumeOrCreateBrowserCollectionRun(
    jobId: string | undefined,
    dataSourceId: string,
    analysisRequestId: string | undefined,
    scope: Prisma.InputJsonValue,
    startedAt: Date,
    correlationId: string = randomUUID(),
    isDemo = false,
  ) {
    return collection_coordinator.resumeOrCreateBrowserCollectionRun.call(this.context, jobId, dataSourceId, analysisRequestId, scope, startedAt, correlationId, isDemo);
  }

  private async collectArgusEventSource(
    sourceId: ArgusEventSourceId,
    marketScope: string,
    analysisRequestId?: string,
    options: CollectSourceOptions = {},
  ) {
    return collection_regional_events.collectArgusEventSource.call(this.context, sourceId, marketScope, analysisRequestId, options);
  }

  private async collectRbnzFxSource(marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
    return collection_regional_events.collectRbnzFxSource.call(this.context, marketScope, analysisRequestId, options);
  }

  private async collectTicketmasterSource(marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
    return collection_ticketmaster.collectTicketmasterSource.call(this.context, marketScope, analysisRequestId, options);
  }

  private assertTicketmasterSourceAllowed(source: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>, localAcceptance: boolean, developmentBootstrap = false, productionCanary = false) {
    return collection_ticketmaster.assertTicketmasterSourceAllowed.call(this.context, source, localAcceptance, developmentBootstrap, productionCanary);
  }

  private async collectEventfindaSource(marketScope: string, analysisRequestId?: string, options: CollectSourceOptions = {}) {
    return collection_eventfinda.collectEventfindaSource.call(this.context, marketScope, analysisRequestId, options);
  }

  private assertEventfindaSourceAllowed(source: Awaited<ReturnType<typeof prisma.dataSource.findUniqueOrThrow>>, localAcceptance = false, developmentBootstrap = false, productionCanary = false) {
    return collection_eventfinda.assertEventfindaSourceAllowed.call(this.context, source, localAcceptance, developmentBootstrap, productionCanary);
  }

  private async executeEventfindaBrowserTask(dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, parentJobId?: string) {
    return collection_browser_connectors.executeEventfindaBrowserTask.call(this.context, dataSourceId, collectionRunId, url, dryRun, parentJobId);
  }

  private async executeOurAucklandBrowserTask(
    dataSourceId: string,
    collectionRunId: string,
    url: string,
    maxRecords: number,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    return collection_browser_connectors.executeOurAucklandBrowserTask.call(this.context, dataSourceId, collectionRunId, url, maxRecords, dryRun, parentJobId);
  }

  private async executeTicketmasterBrowserTask(dataSourceId: string, collectionRunId: string, url: string, dryRun: boolean, parentJobId?: string, entryUrl?: string) {
    return collection_browser_connectors.executeTicketmasterBrowserTask.call(this.context, dataSourceId, collectionRunId, url, dryRun, parentJobId, entryUrl);
  }

  private async executeDirectHttpEventTask(
    dataSourceId: string,
    collectionRunId: string,
    url: string,
    dryRun: boolean,
    extractor: "eventfinda" | "ticketmaster",
    parse: (input: { html: string; title: string; finalUrl: string }) => unknown,
  ): Promise<ArgusBrowserTaskResult> {
    return collection_browser_connectors.executeDirectHttpEventTask.call(this.context, dataSourceId, collectionRunId, url, dryRun, extractor, parse);
  }

  private async loadDirectEventPage(source: "eventfinda" | "ticketmaster", url: string) {
    return collection_browser_connectors.loadDirectEventPage.call(this.context, source, url);
  }

  private async persistDirectHttpEvidence(
    dataSourceId: string,
    collectionRunId: string,
    traceId: string,
    extractor: string,
    requestedUrl: string,
    finalUrl: string,
    html: string,
    parserFailure: boolean,
  ) {
    return collection_persistence.persistDirectHttpEvidence.call(this.context, dataSourceId, collectionRunId, traceId, extractor, requestedUrl, finalUrl, html, parserFailure);
  }

  private async executeRbnzFxBrowserTask(dataSourceId: string, collectionRunId: string, dryRun: boolean, parentJobId?: string) {
    return collection_browser_connectors.executeRbnzFxBrowserTask.call(this.context, dataSourceId, collectionRunId, dryRun, parentJobId);
  }

  private async executeSkiSeasonArgusTask(
    dataSourceId: string,
    collectionRunId: string,
    url: string,
    context: AdapterContext,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    return collection_browser_connectors.executeSkiSeasonArgusTask.call(this.context, dataSourceId, collectionRunId, url, context, dryRun, parentJobId);
  }

  private async executeAviationArgusTask(
    sourceId: "auckland_airport_monthly" | "mot_airline_performance",
    dataSourceId: string,
    collectionRunId: string,
    url: string,
    context: AdapterContext,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    return collection_browser_connectors.executeAviationArgusTask.call(this.context, sourceId, dataSourceId, collectionRunId, url, context, dryRun, parentJobId);
  }

  private async executePublicMarketArgusTask(
    sourceId: string,
    dataSourceId: string,
    collectionRunId: string,
    context: AdapterContext,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    return collection_browser_connectors.executePublicMarketArgusTask.call(this.context, sourceId, dataSourceId, collectionRunId, context, dryRun, parentJobId);
  }

  private async executeLincolnKeyDatesBrowserTask(
    dataSourceId: string,
    collectionRunId: string,
    url: string,
    context: AdapterContext,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    return collection_browser_connectors.executeLincolnKeyDatesBrowserTask.call(this.context, dataSourceId, collectionRunId, url, context, dryRun, parentJobId);
  }

  private async executeCouncilArgusTask(
    dataSourceId: string,
    collectionRunId: string,
    reference: string,
    context: AdapterContext,
    dryRun: boolean,
    parentJobId?: string,
  ): Promise<PublicRawRecord[]> {
    return collection_browser_connectors.executeCouncilArgusTask.call(this.context, dataSourceId, collectionRunId, reference, context, dryRun, parentJobId);
  }

  private async executePriorityArgusEventTask(input: {
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
    return collection_browser_connectors.executePriorityArgusEventTask.call(this.context, input);
  }

  private async persistArgusConnectorPayload(
    dataSourceId: string,
    collectionRunId: string,
    result: ArgusBrowserTaskResult,
    sourceId: ArgusEventSourceId,
    requestedUrl: string,
  ) {
    return collection_persistence.persistArgusConnectorPayload.call(this.context, dataSourceId, collectionRunId, result, sourceId, requestedUrl);
  }

  private async persistArgusEvidence(dataSourceId: string, collectionRunId: string, result: ArgusBrowserTaskResult, extractor: string, requestedUrl: string) {
    return collection_persistence.persistArgusEvidence.call(this.context, dataSourceId, collectionRunId, result, extractor, requestedUrl);
  }

  private async markArgusEvidenceParserFailure(collectionRunId: string, traceId: string) {
    return collection_persistence.markArgusEvidenceParserFailure.call(this.context, collectionRunId, traceId);
  }

  async argusHealth() {
    return operations.argusHealth.call(this.context);
  }

  private async syncCollectionIncidentSafely(collectionRunId: string) {
    return operations.syncCollectionIncidentSafely.call(this.context, collectionRunId);
  }

  async sourceHealth(sourceId?: string) {
    return operations.sourceHealth.call(this.context, sourceId);
  }

  async otaHealth(windowDays = 30) {
    return operations.otaHealth.call(this.context, windowDays);
  }

  async retentionCleanup(now = new Date()) {
    return operations.retentionCleanup.call(this.context, now);
  }

  async activateSource(sourceId: string) {
    return operations.activateSource.call(this.context, sourceId);
  }

  async collectProductionOta(payload: unknown, parentJobId: string) {
    return catalog.collectProductionOta.call(this.context, payload, parentJobId);
  }

  async refreshCatalog(marketScope: string, parentJobId?: string, bounded?: { sourceId: string }) {
    return catalog.refreshCatalog.call(this.context, marketScope, parentJobId, bounded);
  }

  async refreshPanel(membershipType: "ANCHOR" | "ROTATING", marketScope: string, parentJobId?: string) {
    return catalog.refreshPanel.call(this.context, membershipType, marketScope, parentJobId);
  }

  async collectPanelMemberRate(panelMembershipId: string, parentJobId: string, boundedSourceId?: string) {
    return catalog.collectPanelMemberRate.call(this.context, panelMembershipId, parentJobId, boundedSourceId);
  }

  async refreshOtaMarketSignals(marketScope = "new-zealand", asOf = new Date()) {
    return catalog.refreshOtaMarketSignals.call(this.context, marketScope, asOf);
  }

  async suspendSource(sourceId: string) {
    return operations.suspendSource.call(this.context, sourceId);
  }

  async sourceSchedulePlan(sourceIds: string[]) {
    return operations.sourceSchedulePlan.call(this.context, sourceIds);
  }

  async configureSourceSchedules(sourceIds: string[], input: ConfigureSourceSchedulesRequest) {
    return operations.configureSourceSchedules.call(this.context, sourceIds, input);
  }

  async enqueueOperationalJob(type: "CATALOG_DISCOVERY" | "MARKET_COVERAGE_COLLECTION" | "ANCHOR_PANEL_COLLECTION" | "ROTATING_PANEL_COLLECTION", payload: Prisma.InputJsonValue = {}) {
    return operations.enqueueOperationalJob.call(this.context, type, payload);
  }

  async health() {
    return operations.health.call(this.context);
  }

  private async createRequest(input: CreateWorkerRequest, isPreview: boolean) {
    return requests.createRequest.call(this.context, input, isPreview);
  }

  private async resolveAndPersistInput(input: string, correlationId: string, locale: "en" | "zh") {
    return requests.resolveAndPersistInput.call(this.context, input, correlationId, locale);
  }

  private async createBackingPriceCheck(request: WorkerAnalysisRequest) {
    return requests.createBackingPriceCheck.call(this.context, request);
  }

  private async ensureQueryPlan(request: WorkerAnalysisRequest & { queryPlans?: unknown[] }) {
    return requests.ensureQueryPlan.call(this.context, request);
  }

  private async enqueueCollection(request: WorkerAnalysisRequest) {
    return requests.enqueueCollection.call(this.context, request);
  }

  private async enqueueWorkerJob(request: Pick<WorkerAnalysisRequest, "id" | "correlationId" | "priceCheckId" | "targetListingId" | "sellableUnitId">, type: Parameters<typeof enqueueJob>[0]["type"], payload: Record<string, unknown>, suffix: string) {
    return requests.enqueueWorkerJob.call(this.context, request, type, payload, suffix);
  }

  private async requireReadyIdentity(id: string) {
    return requests.requireReadyIdentity.call(this.context, id);
  }

  private async setStatus(request: Pick<WorkerAnalysisRequest, "id" | "priceCheckId">, status: WorkerAnalysisStatus) {
    return requests.setStatus.call(this.context, request, status);
  }

  private async failBusiness(request: Pick<WorkerAnalysisRequest, "id" | "priceCheckId">, status: "INSUFFICIENT_DATA" | "SOURCE_UNAVAILABLE" | "PARTIAL", code: string, message: string) {
    return requests.failBusiness.call(this.context, request, status, code, message);
  }

  private async requireFixtureSource() {
    return pricing.requireFixtureSource.call(this.context);
  }

  private async ensureCollectionProfile(request: WorkerAnalysisRequest, dataSourceId: string) {
    return pricing.ensureCollectionProfile.call(this.context, request, dataSourceId);
  }

  private async ensureFixtureCompetitors(targetUnitId: string, count = 8) {
    return pricing.ensureFixtureCompetitors.call(this.context, targetUnitId, count);
  }

  private async ensureStayQueryForDate(date: string, analysisRequestId: string) {
    return pricing.ensureStayQueryForDate.call(this.context, date, analysisRequestId);
  }

  private async analysisObservationIds(request: WorkerAnalysisRequest, querySignatureHash: string) {
    return pricing.analysisObservationIds.call(this.context, request, querySignatureHash);
  }

  private async collectPublicSignals(request: WorkerAnalysisRequest) {
    return collection_coordinator.collectPublicSignals.call(this.context, request);
  }

  private async publishFormalResult(request: WorkerAnalysisRequest, marketSnapshotId: string, priceAnalysisId: string, confidence: "HIGH" | "MEDIUM" | "LOW", keyDates: Array<{ date: string; target: number; median: number; gap: number; confidence: string; marketSignalIds: string[]; hasMajorEvent: boolean }>, jobId: string) {
    return pricing.publishFormalResult.call(this.context, request, marketSnapshotId, priceAnalysisId, confidence, keyDates, jobId);
  }

  private async publishObservedOnlyResult(
    request: WorkerAnalysisRequest,
    marketSnapshotId: string,
    dates: Array<{ stayDate: Date; targetRateMinor: number | null; qualityFlags: Prisma.JsonValue }>,
    jobId: string,
  ) {
    return pricing.publishObservedOnlyResult.call(this.context, request, marketSnapshotId, dates, jobId);
  }

  private async enforceWorkerLimits(input: CreateWorkerRequest, isPreview: boolean, sellableUnitId: string | null) {
    return requests.enforceWorkerLimits.call(this.context, input, isPreview, sellableUnitId);
  }

  private async recordWorkerUsage(request: WorkerAnalysisRequest, input: CreateWorkerRequest, isPreview: boolean) {
    return requests.recordWorkerUsage.call(this.context, request, input, isPreview);
  }

  private async recordAbuseDecision(action: string, subjectHash: string, reasonCodes: string[]) {
    return requests.recordAbuseDecision.call(this.context, action, subjectHash, reasonCodes);
  }

  private adapterContext(): AdapterContext {
    return collection_coordinator.adapterContext.call(this.context);
  }

  private publicAdapterContext(): AdapterContext {
    return collection_coordinator.publicAdapterContext.call(this.context);
  }

  async persistNormalisedEvent(event: PublicEvent, dataSourceId: string, collectionRunId: string) {
    return collection_persistence.persistNormalisedEvent.call(this.context, event, dataSourceId, collectionRunId);
  }

  async persistNormalisedEvents(events: PublicEvent[], dataSourceId: string, collectionRunId: string) {
    return collection_persistence.persistNormalisedEvents.call(this.context, events, dataSourceId, collectionRunId);
  }

  private async persistEventSignals(event: PublicEvent, dataSourceId: string, collectionRunId: string, eventOccurrenceId: string) {
    return collection_persistence.persistEventSignals.call(this.context, event, dataSourceId, collectionRunId, eventOccurrenceId);
  }

  private async persistNormalisedEventCached(event: PublicEvent, seriesEvent: PublicEvent, dataSourceId: string, collectionRunId: string, cache: EventPersistenceCache) {
    return collection_persistence.persistNormalisedEventCached.call(this.context, event, seriesEvent, dataSourceId, collectionRunId, cache);
  }

  private async reconcileCanonicalEventImpact(eventOccurrenceId: string) {
    return collection_persistence.reconcileCanonicalEventImpact.call(this.context, eventOccurrenceId);
  }

  private fixtureEnabled() {
    return pricing.fixtureEnabled.call(this.context);
  }

}
