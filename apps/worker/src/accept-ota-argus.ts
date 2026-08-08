import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { getEnvironment } from "@tymra/config";

import {
  captureBrowserTaskWithArgus,
  downloadArgusEvidence,
  type ArgusCaptureInput,
} from "./clients/argus-client";
import { finalizeDirectArgusDelivery } from "./services/argus-orchestrator";

const environment = getEnvironment();
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const outputRoot = path.resolve(environment.ARGUS_EVIDENCE_ROOT, `ota-e2e-${suffix}`);
const stay = { checkIn: "2026-08-14", checkOut: "2026-08-15", adults: 2, children: 0, units: 1, currency: "NZD" as const };

const sources = [
  { key: "booking", connectorId: "booking-public", url: "https://www.booking.com/hotel/nz/5-minutes-airport-3-bedroom-6-guests.en-gb.html" },
  { key: "airbnb", connectorId: "airbnb-public", url: "https://www.airbnb.co.nz/rooms/33232168" },
  { key: "expedia", connectorId: "expedia-public", url: "https://www.expedia.co.nz/Christchurch-Hotels-Novotel-Christchurch-Airport.h18258191.Hotel-Information" },
  { key: "bookabach", connectorId: "bookabach-public", url: "https://www.bookabach.co.nz/holiday-accommodation/p9901001" },
  { key: "agoda", connectorId: "agoda-public", url: "https://www.agoda.com/en-nz/novotel-christchurch-airport/hotel/christchurch-nz.html" },
  { key: "trip", connectorId: "trip-public", url: "https://nz.trip.com/hotels/christchurch-2-hotel-detail-9824700/novotel-christchurch-airport/" },
] as const satisfies ReadonlyArray<{ key: string; connectorId: ArgusCaptureInput["connectorId"]; url: string }>;

const selectedSourceKeys = selectedValues("ACCEPTANCE_SOURCES");
const selectedWorkflows = selectedValues("ACCEPTANCE_WORKFLOWS");
const requestedSources = sources.filter((source) => selectedSourceKeys.size === 0 || selectedSourceKeys.has(source.key));
const requestedWorkflows = (["resolve_listing", "collect_rates"] as const).filter((workflow) => selectedWorkflows.size === 0 || selectedWorkflows.has(workflow));
if (requestedSources.length === 0 || requestedWorkflows.length === 0) throw new Error("OTA acceptance selection matched no sources or workflows");

const runs: Array<Record<string, unknown>> = [];
await mkdir(outputRoot, { recursive: true, mode: 0o700 });

for (const source of requestedSources) {
  for (const workflowId of requestedWorkflows) {
    const traceId = `tymra-ota-e2e-${source.key}-${workflowId}-${suffix}`;
    const input: ArgusCaptureInput = {
      traceId,
      connectorId: source.connectorId,
      workflowId,
      url: source.url,
      maxRecords: workflowId === "collect_rates" ? 20 : undefined,
      ...(workflowId === "collect_rates" ? stay : {}),
    };
    const startedAt = Date.now();
    const response = await captureBrowserTaskWithArgus(environment, input);
    if (!response.ok) {
      if (response.delivery) {
        const rawEvidence = response.delivery.job.items.flatMap((item) => item.result?.evidence ?? []);
        const copiedEvidence = await copyEvidence(source.key, workflowId, rawEvidence);
        assertRequiredEvidence(source.key, workflowId, copiedEvidence);
        await finalizeDirectArgusDelivery(environment, `ota-e2e-${source.key}-${workflowId}`, response.delivery, false);
        runs.push({ source: source.key, workflowId, ok: false, httpStatus: response.httpStatus, message: response.message, evidenceCopiedBeforeAck: true, evidence: copiedEvidence, ackedAndPurged: true, durationMs: Date.now() - startedAt });
      } else {
        runs.push({ source: source.key, workflowId, ok: false, httpStatus: response.httpStatus, message: response.message, durationMs: Date.now() - startedAt });
      }
      continue;
    }

    const copiedEvidence = await copyEvidence(source.key, workflowId, response.payload.evidence);
    assertRequiredEvidence(source.key, workflowId, copiedEvidence);

    const summary = summarize(response.payload.extracted);
    const semanticFailure = targetSemanticFailure(source.key, workflowId, response.payload);
    await finalizeDirectArgusDelivery(environment, `ota-e2e-${source.key}-${workflowId}`, response.delivery, false);
    runs.push({
      source: source.key,
      connectorId: source.connectorId,
      workflowId,
      ok: response.payload.ok && semanticFailure === null,
      status: response.payload.status,
      semanticFailure,
      readonlyOnly: response.payload.readonlyOnly,
      externalSideEffectsPerformed: response.payload.externalSideEffectsPerformed,
      evidenceCopiedBeforeAck: true,
      evidence: copiedEvidence,
      ackedAndPurged: true,
      durationMs: Date.now() - startedAt,
      ...summary,
    });
  }
}

const completedSources = requestedSources
  .filter((source) => requestedWorkflows.every((workflowId) => runs.some((run) => run.source === source.key && run.workflowId === workflowId && run.ok === true && run.ackedAndPurged === true)))
  .map((source) => source.key);
const report = {
  acceptance: "tymra-argus-six-ota-e2e",
  generatedAt: new Date().toISOString(),
  argusBaseUrl: environment.ARGUS_API_BASE_URL,
  requestedSources: requestedSources.map((source) => source.key),
  requestedWorkflows,
  completedSources,
  allSourcesCompleted: runs.length === requestedSources.length * requestedWorkflows.length && runs.every((run) => run.ok === true && run.ackedAndPurged === true),
  evidenceRoot: outputRoot,
  runs,
};
await writeFile(path.join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.allSourcesCompleted || runs.some((run) => run.ok !== true || run.ackedAndPurged !== true)) process.exitCode = 1;

function summarize(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const data = value as Record<string, unknown>;
  const rates = Array.isArray(data.rates) ? data.rates.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
  return {
    dataSchema: data.data_schema,
    schemaVersion: data.schema_version,
    sourceListingId: data.sourceListingId ?? rates[0]?.sourceListingId ?? null,
    unitIdentityStatus: data.unitIdentityStatus ?? null,
    unitCount: Array.isArray(data.units) ? data.units.length : null,
    rateCount: rates.length || null,
    availabilityStatuses: [...new Set(rates.map((rate) => rate.availabilityStatus).filter(Boolean))],
    priceStatuses: [...new Set(rates.map((rate) => rate.priceStatus).filter(Boolean))],
    totalPricesMinor: [...new Set(rates.map((rate) => rate.totalPriceMinor).filter((value) => typeof value === "number"))],
    nightlyPricesMinor: [...new Set(rates.map((rate) => rate.nightlyPriceMinor).filter((value) => typeof value === "number"))],
    rateFences: [...new Set(rates.map((rate) => rate.rateFence).filter(Boolean))],
    incompleteAvailableRates: rates.filter((rate) => rate.availabilityStatus === "AVAILABLE" && [rate.basePriceMinor, rate.mandatoryFeesMinor, rate.taxesMinor, rate.totalPriceMinor].some((amount) => amount === null)).length,
  };
}

function targetSemanticFailure(source: string, workflow: string, payload: { ok: boolean; status: string; extracted: unknown }): string | null {
  if (!payload.ok || payload.status !== "success") return `Argus returned ${payload.status}`;
  if (!payload.extracted || typeof payload.extracted !== "object" || Array.isArray(payload.extracted)) return "Argus returned no structured extraction";
  const data = payload.extracted as Record<string, unknown>;
  if (source === "expedia" && workflow === "resolve_listing") {
    if (data.unitIdentityStatus !== "not_public" || !Array.isArray(data.units) || data.units.length !== 0 || data.quality !== "partial") {
      return "Expedia property-only resolution did not preserve not_public/empty-unit/partial semantics";
    }
  }
  if (source === "agoda" && workflow === "collect_rates") {
    const rates = Array.isArray(data.rates) ? data.rates.filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value)) : [];
    if (rates.length === 0) return "Agoda returned no public rates";
    if (rates.some((rate) => rate.availabilityStatus !== "AVAILABLE" || rate.priceStatus !== "PARTIAL" || rate.rateFence !== "PUBLIC_SIGNED_OUT" || typeof rate.nightlyPriceMinor !== "number" || rate.totalPriceMinor !== null)) {
      return "Agoda rates did not preserve AVAILABLE/PARTIAL/public-nightly/null-total semantics";
    }
  }
  return null;
}

function selectedValues(name: string): Set<string> {
  return new Set((process.env[name] ?? "").split(",").map((value) => value.trim()).filter(Boolean));
}

async function copyEvidence(source: string, workflow: string, pointers: Parameters<typeof downloadArgusEvidence>[1][]) {
  const copied: Array<{ kind: string; bytes: number; sha256: string; file: string }> = [];
  for (const [index, pointer] of pointers.entries()) {
    const content = await downloadArgusEvidence(environment, pointer);
    const extension = pointer.kind === "screenshot" ? "png" : pointer.kind === "html" ? "html" : "bin";
    const file = `${source}-${workflow}-${index + 1}.${extension}`;
    await writeFile(path.join(outputRoot, file), content, { mode: 0o600 });
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (sha256 !== pointer.sha256 || content.byteLength !== pointer.sizeBytes) throw new Error(`Copied evidence changed for ${pointer.traceId}/${pointer.kind}`);
    copied.push({ kind: pointer.kind, bytes: content.byteLength, sha256, file });
  }
  return copied;
}

function assertRequiredEvidence(source: string, workflow: string, evidence: Array<{ kind: string }>): void {
  if (!evidence.some((item) => item.kind === "html") || !evidence.some((item) => item.kind === "screenshot")) {
    throw new Error(`${source}/${workflow} did not expose both HTML and screenshot evidence`);
  }
}
