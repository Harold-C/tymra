import { createHash } from "node:crypto";

import type { Environment } from "@tymra/config";
import { lincolnKeyDatesExtractionSchema } from "../collection/lincoln-university-key-dates";
import {
  sportySchoolSportExtractionSchema,
  ticketekDetailExtractionSchema,
  ticketekListingExtractionSchema,
} from "../collection/school-sport-ticketek";
import { regionalArgusEventExtractionSchema } from "../collection/regional-argus-events";
import {
  officialVenueEventsExtractionSchema,
  officialVenueResolveExtractionSchema,
  publicAirportFlightBoardExtractionSchema,
  publicCruiseScheduleExtractionSchema,
  publicUniversityKeyDatesExtractionSchema,
} from "../collection/public-market-argus";
import { aucklandAirportMonthlyExtractionSchema, motAirlinePerformanceExtractionSchema } from "../collection/aviation-argus-signals";
import { otaCollectRatesExtractionSchema, otaDiscoverListingsExtractionSchema, otaResolveListingExtractionSchema } from "@tymra/providers";

export type ArgusEvidenceKind = "html" | "screenshot" | "download";

type ArgusEvidencePointerBase = {
  traceId: string;
  relativePath: string;
  storageRef: string;
  sha256: string;
  sizeBytes: number;
  containsSensitiveData: false;
  createdAt: string;
};

export type ArgusEvidencePointer = ArgusEvidencePointerBase & (
  | { kind: "html" | "screenshot"; evidenceId?: string }
  | {
      kind: "download";
      evidenceId: string;
      filename: string;
      contentType: string;
      sourceUrl: string;
    }
);

export type ArgusConnectorId = "ticketmaster-public" | "eventfinda-public" | "ourauckland-public" | "rbnz-fx" | "lincoln-university-key-dates" | "sporty-school-sport-public" | "ticketek-public" | "dunedinnz-public" | "auckland-airport-monthly" | "mot-airline-performance" | "booking-public" | "airbnb-public" | "expedia-public" | "wotif-public" | "hotels-public" | "bookabach-public" | "vrbo-public" | "agoda-public" | "trip-public" | "eden-park-public" | "nzicc-public" | "sky-stadium-public" | "forsyth-barr-stadium-public" | "takina-public" | "claudelands-public" | "port-tauranga-cruise-public" | "centreport-cruise-public" | "port-otago-cruise-public" | "dunedin-airport-public" | "rotorua-airport-public" | "hamilton-airport-public" | "hawkes-bay-airport-public" | "new-plymouth-airport-public" | "palmerston-north-airport-public" | "otago-university-key-dates-public" | "victoria-university-key-dates-public" | "waikato-university-key-dates-public" | "massey-university-key-dates-public" | "aut-university-key-dates-public";
export type ArgusWorkflowId = "collect_listing" | "collect_detail" | "collect_exchange_rates" | "collect_key_dates" | "collect_events" | "collect_monthly_traffic" | "collect_monthly_performance" | "resolve_listing" | "discover_listings" | "collect_rates" | "resolve_venue" | "collect_cruise_schedule" | "collect_flights";

type ArgusDataContract = {
  dataSchema: string;
  schemaVersion: "1.0.0";
};

const argusDataContracts = {
  "ticketmaster-public:collect_listing": {
    dataSchema: "ticketmaster-public.collect_listing",
    schemaVersion: "1.0.0",
  },
  "ticketmaster-public:collect_detail": {
    dataSchema: "ticketmaster-public.collect_detail",
    schemaVersion: "1.0.0",
  },
  "eventfinda-public:collect_listing": {
    dataSchema: "eventfinda-public.collect_listing",
    schemaVersion: "1.0.0",
  },
  "eventfinda-public:collect_detail": {
    dataSchema: "eventfinda-public.collect_detail",
    schemaVersion: "1.0.0",
  },
  "ourauckland-public:collect_listing": {
    dataSchema: "ourauckland-public.collect_listing",
    schemaVersion: "1.0.0",
  },
  "ourauckland-public:collect_detail": {
    dataSchema: "ourauckland-public.collect_detail",
    schemaVersion: "1.0.0",
  },
  "rbnz-fx:collect_exchange_rates": {
    dataSchema: "rbnz-fx.collect_exchange_rates",
    schemaVersion: "1.0.0",
  },
  "lincoln-university-key-dates:collect_key_dates": {
    dataSchema: "lincoln-university-key-dates.collect_key_dates",
    schemaVersion: "1.0.0",
  },
  "sporty-school-sport-public:collect_events": {
    dataSchema: "sporty-school-sport-public.collect_events",
    schemaVersion: "1.0.0",
  },
  "ticketek-public:collect_listing": {
    dataSchema: "ticketek-public.collect_listing",
    schemaVersion: "1.0.0",
  },
  "ticketek-public:collect_detail": {
    dataSchema: "ticketek-public.collect_detail",
    schemaVersion: "1.0.0",
  },
  "dunedinnz-public:collect_events": {
    dataSchema: "regional-events-public.collect_events",
    schemaVersion: "1.0.0",
  },
  "auckland-airport-monthly:collect_monthly_traffic": {
    dataSchema: "auckland-airport-monthly.collect_monthly_traffic",
    schemaVersion: "1.0.0",
  },
  "mot-airline-performance:collect_monthly_performance": {
    dataSchema: "mot-airline-performance.collect_monthly_performance",
    schemaVersion: "1.0.0",
  },
  "booking-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "booking-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "booking-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "airbnb-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "airbnb-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "airbnb-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "expedia-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "expedia-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "expedia-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "wotif-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "wotif-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "wotif-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "hotels-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "hotels-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "hotels-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "bookabach-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "bookabach-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "bookabach-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "vrbo-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "vrbo-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "vrbo-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "agoda-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "agoda-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "agoda-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "trip-public:resolve_listing": { dataSchema: "ota-public.resolve_listing", schemaVersion: "1.0.0" },
  "trip-public:discover_listings": { dataSchema: "ota-public.discover_listings", schemaVersion: "1.0.0" },
  "trip-public:collect_rates": { dataSchema: "ota-public.collect_rates", schemaVersion: "1.0.0" },
  "eden-park-public:resolve_venue": { dataSchema: "official-venue-public.resolve_venue", schemaVersion: "1.0.0" },
  "eden-park-public:collect_events": { dataSchema: "official-venue-public.collect_events", schemaVersion: "1.0.0" },
  "nzicc-public:resolve_venue": { dataSchema: "official-venue-public.resolve_venue", schemaVersion: "1.0.0" },
  "nzicc-public:collect_events": { dataSchema: "official-venue-public.collect_events", schemaVersion: "1.0.0" },
  "sky-stadium-public:resolve_venue": { dataSchema: "official-venue-public.resolve_venue", schemaVersion: "1.0.0" },
  "sky-stadium-public:collect_events": { dataSchema: "official-venue-public.collect_events", schemaVersion: "1.0.0" },
  "forsyth-barr-stadium-public:resolve_venue": { dataSchema: "official-venue-public.resolve_venue", schemaVersion: "1.0.0" },
  "forsyth-barr-stadium-public:collect_events": { dataSchema: "official-venue-public.collect_events", schemaVersion: "1.0.0" },
  "takina-public:resolve_venue": { dataSchema: "official-venue-public.resolve_venue", schemaVersion: "1.0.0" },
  "takina-public:collect_events": { dataSchema: "official-venue-public.collect_events", schemaVersion: "1.0.0" },
  "claudelands-public:resolve_venue": { dataSchema: "official-venue-public.resolve_venue", schemaVersion: "1.0.0" },
  "claudelands-public:collect_events": { dataSchema: "official-venue-public.collect_events", schemaVersion: "1.0.0" },
  "port-tauranga-cruise-public:collect_cruise_schedule": { dataSchema: "public-cruise.collect_schedule", schemaVersion: "1.0.0" },
  "centreport-cruise-public:collect_cruise_schedule": { dataSchema: "public-cruise.collect_schedule", schemaVersion: "1.0.0" },
  "port-otago-cruise-public:collect_cruise_schedule": { dataSchema: "public-cruise.collect_schedule", schemaVersion: "1.0.0" },
  "dunedin-airport-public:collect_flights": { dataSchema: "public-airport-flight-board.collect_flights", schemaVersion: "1.0.0" },
  "rotorua-airport-public:collect_flights": { dataSchema: "public-airport-flight-board.collect_flights", schemaVersion: "1.0.0" },
  "hamilton-airport-public:collect_flights": { dataSchema: "public-airport-flight-board.collect_flights", schemaVersion: "1.0.0" },
  "hawkes-bay-airport-public:collect_flights": { dataSchema: "public-airport-flight-board.collect_flights", schemaVersion: "1.0.0" },
  "new-plymouth-airport-public:collect_flights": { dataSchema: "public-airport-flight-board.collect_flights", schemaVersion: "1.0.0" },
  "palmerston-north-airport-public:collect_flights": { dataSchema: "public-airport-flight-board.collect_flights", schemaVersion: "1.0.0" },
  "otago-university-key-dates-public:collect_key_dates": { dataSchema: "public-university-key-dates.collect_key_dates", schemaVersion: "1.0.0" },
  "victoria-university-key-dates-public:collect_key_dates": { dataSchema: "public-university-key-dates.collect_key_dates", schemaVersion: "1.0.0" },
  "waikato-university-key-dates-public:collect_key_dates": { dataSchema: "public-university-key-dates.collect_key_dates", schemaVersion: "1.0.0" },
  "massey-university-key-dates-public:collect_key_dates": { dataSchema: "public-university-key-dates.collect_key_dates", schemaVersion: "1.0.0" },
  "aut-university-key-dates-public:collect_key_dates": { dataSchema: "public-university-key-dates.collect_key_dates", schemaVersion: "1.0.0" },
} as const satisfies Record<string, ArgusDataContract>;

const officialVenueConnectors = new Set<ArgusConnectorId>(["eden-park-public", "nzicc-public", "sky-stadium-public", "forsyth-barr-stadium-public", "takina-public", "claudelands-public"]);
const cruiseConnectors = new Set<ArgusConnectorId>(["port-tauranga-cruise-public", "centreport-cruise-public", "port-otago-cruise-public"]);
const liveAirportConnectors = new Set<ArgusConnectorId>(["dunedin-airport-public", "rotorua-airport-public", "hamilton-airport-public", "hawkes-bay-airport-public", "new-plymouth-airport-public", "palmerston-north-airport-public"]);
const universityKeyDateConnectors = new Set<ArgusConnectorId>(["otago-university-key-dates-public", "victoria-university-key-dates-public", "waikato-university-key-dates-public", "massey-university-key-dates-public", "aut-university-key-dates-public"]);

const otaArgusConnectors = new Set<ArgusConnectorId>([
  "booking-public",
  "airbnb-public",
  "expedia-public",
  "wotif-public",
  "hotels-public",
  "bookabach-public",
  "vrbo-public",
  "agoda-public",
  "trip-public",
]);

type ArgusCaptureResult = {
  contract_version: "1.0";
  ok: boolean;
  status: "success" | "partial" | "challenge" | "rate_limited" | "failed";
  trace_id: string;
  connector_id: ArgusConnectorId;
  workflow_id: ArgusWorkflowId;
  readonly_only: true;
  external_side_effects_performed: false;
  page: {
    title: string;
    final_url: string;
    html_bytes: number;
    screenshot_bytes: number;
  } | null;
  data: unknown;
  evidence: ArgusEvidencePointer[];
  challenge: {
    kind: string;
    signals: string[];
    manual_session?: {
      session_id: string;
      no_vnc_url: string;
      expires_at: string;
    } | null;
  } | null;
  error: { category: string; message: string; retryable: boolean } | null;
};

export type ArgusJobSummary = {
  job_id: string;
  status: "QUEUED" | "RUNNING" | "WAITING_FOR_MANUAL" | "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "CANCEL_REQUESTED" | "CANCELLED";
  operator_action?: {
    required: true;
    type: "novnc_handoff";
    issue_url: "/v1/handoffs";
    reason: "captcha" | "cloudflare" | "bot_verification";
    session_ttl_seconds: number;
    session_id: string;
    expires_at: string;
  } | null;
};

export type ArgusJobResult = ArgusJobSummary & {
  result_sha256: string;
  items: Array<{
    trace_id: string;
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
    result: ArgusCaptureResult | null;
    error_category: string | null;
  }>;
  error: { category: string; message: string; retryable: boolean } | null;
};

export type ArgusBrowserTaskResult = {
  ok: boolean;
  status: "success" | "manual_required" | "failed";
  traceId: string;
  taskType: "read_only_capture";
  page: { title: string; finalUrl: string; htmlBytes: number; screenshotBytes: number } | null;
  evidence: ArgusEvidencePointer[];
  error: { category: string; message: string; retryable: boolean } | null;
  manualRequired: {
    reason: string;
    sessionId: string | null;
    noVncUrl: string | null;
    expiresAt: string | null;
  } | null;
  readonlyOnly: true;
  externalSideEffectsPerformed: false;
  extracted: unknown;
};

export type ArgusCaptureInput = {
  traceId: string;
  connectorId: ArgusConnectorId;
  workflowId: ArgusWorkflowId;
  url: string;
  entryUrl?: string;
  startDate?: string;
  endDate?: string;
  from?: string;
  to?: string;
  academicYear?: number;
  maxRecords?: number;
  searchQuery?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number;
  children?: number;
  units?: number;
  currency?: "NZD";
  maxAttempts?: 1 | 2;
  timeoutMs?: number;
};

export type CaptureResponse =
  | { ok: true; httpStatus: number; payload: ArgusBrowserTaskResult; delivery: ArgusResultDelivery }
  | { ok: false; httpStatus: number; message: string; delivery?: ArgusResultDelivery; manualRequired?: ArgusManualHandoff };

export type ArgusManualHandoff = {
  jobId: string;
  reason: string;
  sessionId: string;
  noVncUrl: string;
  expiresAt: string;
};

export type ArgusResultDelivery = {
  jobId: string;
  resultSha256: string;
  job: ArgusJobResult;
};

const terminalJobStatuses = new Set<ArgusJobSummary["status"]>([
  "COMPLETED",
  "COMPLETED_WITH_WARNINGS",
  "FAILED",
  "CANCELLED",
]);

function argusHeaders(environment: Environment) {
  return {
    authorization: `Bearer ${environment.ARGUS_API_TOKEN}`,
    "content-type": "application/json",
  };
}

export async function downloadArgusEvidence(
  environment: Environment,
  pointer: ArgusEvidencePointer,
): Promise<Buffer> {
  if (pointer.kind !== "html" && pointer.kind !== "screenshot" && pointer.kind !== "download") {
    throw new Error(`Argus evidence kind ${pointer.kind} cannot be retained`);
  }
  const evidenceId = pointer.kind === "download" ? pointer.evidenceId : pointer.evidenceId ?? pointer.kind;
  if (!/^[a-z][a-z0-9_-]{0,63}$/u.test(evidenceId)) {
    throw new Error(`Argus evidence ID ${evidenceId} is invalid`);
  }
  const response = await fetch(
    new URL(`/v1/event-captures/${encodeURIComponent(pointer.traceId)}/evidence/${encodeURIComponent(evidenceId)}`, environment.ARGUS_API_BASE_URL),
    {
      headers: argusHeaders(environment),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
    },
  );
  if (!response.ok) throw new Error(`Argus evidence download returned HTTP ${response.status}`);
  const content = Buffer.from(await response.arrayBuffer());
  const contentHash = createHash("sha256").update(content).digest("hex");
  const responseHash = response.headers.get("x-argus-content-sha256");
  if (content.byteLength !== pointer.sizeBytes || contentHash !== pointer.sha256 || responseHash !== pointer.sha256) {
    throw new Error(`Argus evidence integrity check failed for ${pointer.traceId}/${pointer.kind}`);
  }
  return content;
}

export async function getArgusHealth(environment: Environment) {
  const startedAt = Date.now();
  try {
    const [health, readiness] = await Promise.all([
      fetch(new URL("/health", environment.ARGUS_API_BASE_URL), { signal: AbortSignal.timeout(5_000) }),
      fetch(new URL("/readiness", environment.ARGUS_API_BASE_URL), { signal: AbortSignal.timeout(5_000) }),
    ]);
    return {
      healthy: health.ok && readiness.ok,
      ready: readiness.ok,
      mode: "argus",
      latencyMs: Date.now() - startedAt,
      healthStatus: health.status,
      readinessStatus: readiness.status,
    };
  } catch (error) {
    return {
      healthy: false,
      ready: false,
      mode: "argus",
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Argus health check failed",
    };
  }
}

export function isTerminalArgusJobStatus(status: ArgusJobSummary["status"]): boolean {
  return terminalJobStatuses.has(status);
}

export async function submitArgusCapture(
  environment: Environment,
  input: ArgusCaptureInput,
): Promise<{ ok: true; job: ArgusJobSummary } | { ok: false; httpStatus: number; message: string }> {
  try {
    const response = await fetch(new URL("/v1/jobs", environment.ARGUS_API_BASE_URL!), {
      method: "POST",
      headers: argusHeaders(environment),
      body: JSON.stringify(argusJobRequest(environment, input)),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS + 15_000),
    });
    const job = await jsonResponse<ArgusJobSummary>(response);
    if (!response.ok) return failedResponse(response.status, job);
    if (!job.job_id) return { ok: false, httpStatus: 502, message: "Argus returned no job ID" };
    return { ok: true, job };
  } catch (error) {
    return requestFailure(error);
  }
}

export async function getArgusJob(
  environment: Environment,
  jobId: string,
): Promise<{ ok: true; job: ArgusJobSummary } | { ok: false; httpStatus: number; message: string }> {
  try {
    const response = await fetch(new URL(`/v1/jobs/${jobId}`, environment.ARGUS_API_BASE_URL!), {
      headers: argusHeaders(environment),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
    });
    const job = await jsonResponse<ArgusJobSummary>(response);
    return response.ok ? { ok: true, job } : failedResponse(response.status, job);
  } catch (error) {
    return requestFailure(error);
  }
}

export async function getArgusJobResult(
  environment: Environment,
  jobId: string,
): Promise<{ ok: true; job: ArgusJobResult } | { ok: false; httpStatus: number; message: string }> {
  try {
    const response = await fetch(new URL(`/v1/jobs/${jobId}/result`, environment.ARGUS_API_BASE_URL!), {
      headers: argusHeaders(environment),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
    });
    const job = await jsonResponse<ArgusJobResult>(response);
    return response.ok ? { ok: true, job } : failedResponse(response.status, job);
  } catch (error) {
    return requestFailure(error);
  }
}

export async function acknowledgeArgusJobResult(
  environment: Environment,
  jobId: string,
  resultSha256: string,
): Promise<{ ok: true } | { ok: false; httpStatus: number; message: string }> {
  if (!/^[a-f0-9]{64}$/u.test(resultSha256)) {
    return { ok: false, httpStatus: 502, message: "Argus returned an invalid result SHA-256" };
  }
  try {
    const response = await fetch(new URL(`/v1/jobs/${jobId}/ack`, environment.ARGUS_API_BASE_URL!), {
      method: "POST",
      headers: argusHeaders(environment),
      body: JSON.stringify({ contract_version: "1.0", result_sha256: resultSha256 }),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
    });
    const body = await jsonResponse<Record<string, never>>(response);
    return response.ok ? { ok: true } : failedResponse(response.status, body);
  } catch (error) {
    return requestFailure(error);
  }
}

export async function cancelArgusJob(environment: Environment, jobId: string): Promise<void> {
  try {
    await fetch(new URL(`/v1/jobs/${jobId}`, environment.ARGUS_API_BASE_URL!), {
      method: "DELETE",
      headers: argusHeaders(environment),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
    });
  } catch {
    // Cancellation is best-effort; the local parent remains authoritative.
  }
}

export async function captureBrowserTaskWithArgus(
  environment: Environment,
  input: ArgusCaptureInput,
): Promise<CaptureResponse> {
  const maxAttempts = input.maxAttempts ?? 1;
  const captureTimeoutMs = input.timeoutMs ?? environment.ARGUS_TIMEOUT_MS;
  const pollTimeoutMs = environment.ARGUS_JOB_POLL_TIMEOUT_MS * maxAttempts;
  const deadline = Date.now() + pollTimeoutMs;

  try {
    const submission = await submitArgusCapture(environment, input);
    if (!submission.ok) return submission;
    const created = submission.job;

    let summary = created;
    while (!terminalJobStatuses.has(summary.status)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        const delivery = await cancelAndCollectArgusDelivery(environment, created.job_id, captureTimeoutMs);
        return { ok: false, httpStatus: 504, message: "Argus job polling timed out", ...(delivery ? { delivery } : {}) };
      }
      await wait(Math.min(500, remaining));
      const statusResponse = await getArgusJob(environment, created.job_id);
      if (!statusResponse.ok) {
        if (statusResponse.httpStatus >= 500) continue;
        return statusResponse;
      }
      summary = statusResponse.job;
      if (summary.status === "WAITING_FOR_MANUAL") {
        const handoff = await issueArgusManualHandoff(environment, summary);
        return handoff.ok
          ? { ok: false, httpStatus: 409, message: "Argus requires same-session manual verification", manualRequired: handoff.handoff }
          : handoff;
      }
    }

    const resultResponse = await getArgusJobResult(environment, created.job_id);
    if (!resultResponse.ok) return resultResponse;
    const job = resultResponse.job;
    const item = job.items?.find((candidate) => candidate.trace_id === input.traceId) ?? job.items?.[0];
    if (!item?.result) {
      return {
        ok: false,
        httpStatus: job.status === "CANCELLED" ? 409 : 502,
        message: job.error?.message ?? item?.error_category ?? `Argus job ended with ${job.status}`,
      };
    }
    return mapArgusJobResult(job, input, environment);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeout = error instanceof DOMException && error.name === "TimeoutError" || /timed? ?out|timeout|aborted/i.test(message);
    return { ok: false, httpStatus: timeout ? 504 : 503, message: `Argus request failed: ${message}` };
  }
}

async function issueArgusManualHandoff(
  environment: Environment,
  job: ArgusJobSummary,
): Promise<{ ok: true; handoff: ArgusManualHandoff } | { ok: false; httpStatus: number; message: string }> {
  const action = job.operator_action;
  if (!action?.session_id) return { ok: false, httpStatus: 502, message: "Argus manual Job has no operator session" };
  try {
    const response = await fetch(new URL("/v1/handoffs", environment.ARGUS_API_BASE_URL!), {
      method: "POST",
      headers: argusHeaders(environment),
      body: JSON.stringify({ contract_version: "1.0", job_id: job.job_id, session_id: action.session_id, ttl_seconds: 900 }),
      signal: AbortSignal.timeout(environment.ARGUS_TIMEOUT_MS),
    });
    const body = await jsonResponse<{ url?: string; expires_at?: string; session_id?: string }>(response);
    if (!response.ok) return failedResponse(response.status, body);
    const url = new URL(body.url ?? "");
    const expiresAt = Date.parse(body.expires_at ?? "");
    if (!allowedManualOrigins(environment).has(url.origin)
      || url.username || url.password || body.session_id !== action.session_id
      || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return { ok: false, httpStatus: 502, message: "Argus returned an invalid manual handoff" };
    }
    return { ok: true, handoff: {
      jobId: job.job_id, reason: action.reason, sessionId: action.session_id,
      noVncUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString(),
    } };
  } catch (error) {
    return requestFailure(error);
  }
}

async function cancelAndCollectArgusDelivery(
  environment: Environment,
  jobId: string,
  captureTimeoutMs: number,
): Promise<ArgusResultDelivery | undefined> {
  await cancelArgusJob(environment, jobId);
  const cleanupDeadline = Date.now() + Math.max(30_000, captureTimeoutMs + 30_000);
  while (Date.now() < cleanupDeadline) {
    const statusResponse = await getArgusJob(environment, jobId);
    if (statusResponse.ok && terminalJobStatuses.has(statusResponse.job.status)) {
      const resultResponse = await getArgusJobResult(environment, jobId);
      if (!resultResponse.ok) return undefined;
      return {
        jobId: resultResponse.job.job_id,
        resultSha256: resultResponse.job.result_sha256,
        job: resultResponse.job,
      };
    }
    await wait(500);
  }
  return undefined;
}

export function mapArgusJobResult(
  job: ArgusJobResult,
  input: Pick<ArgusCaptureInput, "traceId" | "connectorId" | "workflowId">,
  environment: Environment,
): CaptureResponse {
  const item = job.items?.find((candidate) => candidate.trace_id === input.traceId) ?? job.items?.[0];
  if (!item?.result) {
    return {
      ok: false,
      httpStatus: job.status === "CANCELLED" ? 409 : 502,
      message: job.error?.message ?? item?.error_category ?? `Argus job ended with ${job.status}`,
    };
  }
  try {
    return {
      ok: true,
      httpStatus: 200,
      payload: mapArgusResult(item.result, input.connectorId, input.workflowId, environment),
      delivery: { jobId: job.job_id, resultSha256: job.result_sha256, job },
    };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      message: error instanceof Error ? error.message : "Argus returned an invalid connector result",
      delivery: { jobId: job.job_id, resultSha256: job.result_sha256, job },
    };
  }
}

export function captureTicketmasterListingWithArgus(
  environment: Environment,
  input: { traceId: string; url: string; maxRecords?: number },
): Promise<CaptureResponse> {
  return captureBrowserTaskWithArgus(environment, {
    ...input,
    connectorId: "ticketmaster-public",
    workflowId: "collect_listing",
  });
}

function mapArgusResult(
  result: ArgusCaptureResult,
  connectorId: ArgusConnectorId,
  workflowId: ArgusWorkflowId,
  environment: Environment,
): ArgusBrowserTaskResult {
  if (
    result.contract_version !== "1.0"
    || result.readonly_only !== true
    || result.external_side_effects_performed !== false
    || result.connector_id !== connectorId
    || result.workflow_id !== workflowId
  ) {
    throw new Error("Argus violated the v1 read-only connector result contract");
  }
  const hasConnectorData = result.status === "success" || result.status === "partial";
  if (hasConnectorData) {
    assertArgusDataContract(result.data, connectorId, workflowId);
  } else if (result.data !== null) {
    throw new Error("Argus returned connector data for an unsuccessful capture");
  }
  const manualRequired = result.status === "challenge" || result.status === "rate_limited";
  return {
    ok: result.ok,
    status: manualRequired ? "manual_required" : result.status === "success" || result.status === "partial" ? "success" : "failed",
    traceId: result.trace_id,
    taskType: "read_only_capture",
    page: result.page ? {
      title: result.page.title,
      finalUrl: result.page.final_url,
      htmlBytes: result.page.html_bytes,
      screenshotBytes: result.page.screenshot_bytes,
    } : null,
    evidence: result.evidence,
    error: result.error,
    manualRequired: manualRequired ? mapManualRequired(result, environment) : null,
    readonlyOnly: true,
    externalSideEffectsPerformed: false,
    extracted: adaptExtraction(result.data, connectorId, workflowId, result.page?.title),
  };
}

function allowedManualOrigins(environment: Environment): Set<string> {
  return new Set(environment.NODE_ENV === "production"
    ? ["https://connect.argus.nz"]
    : ["https://connect.argus.test", "https://connect.argus.nz"]);
}

function mapManualRequired(result: ArgusCaptureResult, environment: Environment): ArgusBrowserTaskResult["manualRequired"] {
  const reason = result.challenge?.kind ?? result.status;
  if (!/captcha/iu.test(reason)) return { reason, sessionId: null, noVncUrl: null, expiresAt: null };

  const session = result.challenge?.manual_session;
  if (!session?.session_id || !session.no_vnc_url || !session.expires_at) {
    throw new Error("Argus returned a CAPTCHA challenge without a manual noVNC session");
  }
  let noVncUrl: URL;
  try {
    noVncUrl = new URL(session.no_vnc_url);
  } catch {
    throw new Error("Argus returned an invalid CAPTCHA noVNC URL");
  }
  const expiresAt = Date.parse(session.expires_at);
  const allowedOrigins = allowedManualOrigins(environment);
  const remainingMs = expiresAt - Date.now();
  if (!allowedOrigins.has(noVncUrl.origin) || noVncUrl.username || noVncUrl.password
    || Number.isNaN(expiresAt) || remainingMs <= 0 || remainingMs > 900_000) {
    throw new Error("Argus returned an invalid CAPTCHA manual-session contract");
  }
  return {
    reason,
    sessionId: session.session_id,
    noVncUrl: noVncUrl.toString(),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function adaptExtraction(
  data: unknown,
  connectorId: ArgusConnectorId,
  workflowId: ArgusWorkflowId,
  pageTitle?: string,
): unknown {
  if (connectorId !== "ticketmaster-public" || workflowId !== "collect_detail") return data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const detail = data as Record<string, unknown>;
  if (detail.kind !== "detail" || !detail.event || typeof detail.event !== "object" || Array.isArray(detail.event)) return data;
  const event = detail.event as Record<string, unknown>;
  const offers = event.offers && typeof event.offers === "object" && !Array.isArray(event.offers)
    ? event.offers as Record<string, unknown>
    : {};
  return {
    extractor: "ticketmaster",
    kind: "event_detail",
    title: typeof event.title === "string" ? event.title : pageTitle ?? "",
    canonicalUrl: detail.canonicalUrl,
    events: [{
      eventId: event.eventId,
      title: event.title,
      sourceUrl: event.sourceUrl,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timePrecision: event.timePrecision,
      timezone: event.timezone,
      eventStatus: event.eventStatus,
      attendanceMode: event.attendanceMode,
      description: event.description,
      category: event.category,
      venue: event.venue,
      performers: Array.isArray(event.performers)
        ? event.performers.map((performer) => typeof performer === "string" ? { name: performer } : performer)
        : [],
      offers: Object.keys(offers).length === 0 ? [] : [{
        availability: offers.availability,
        url: offers.url,
        price: offers.lowPrice,
        priceCurrency: offers.priceCurrency,
      }],
      imageUrls: Array.isArray(event.imageUrls) ? event.imageUrls : [],
      impactEvidence: event.impactEvidence,
    }],
    quality: detail.quality,
    missingFields: detail.missingFields,
    warnings: detail.warnings,
    fieldSources: detail.fieldSources,
  };
}

function assertArgusDataContract(
  data: unknown,
  connectorId: ArgusConnectorId,
  workflowId: ArgusWorkflowId,
): asserts data is Record<string, unknown> {
  const expected = expectedArgusDataContract(connectorId, workflowId);
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Argus returned no ${expected.dataSchema}@${expected.schemaVersion} data object`);
  }
  const record = data as Record<string, unknown>;
  if (record.data_schema !== expected.dataSchema || record.schema_version !== expected.schemaVersion) {
    throw new Error(
      `Argus returned unexpected data contract; expected ${expected.dataSchema}@${expected.schemaVersion}`,
    );
  }
  if (connectorId === "lincoln-university-key-dates" && workflowId === "collect_key_dates") {
    const parsed = lincolnKeyDatesExtractionSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Argus returned invalid Lincoln key-dates data: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`);
    }
  }
  const sourceSchema = connectorId === "sporty-school-sport-public" && workflowId === "collect_events"
    ? sportySchoolSportExtractionSchema
    : connectorId === "ticketek-public" && workflowId === "collect_listing"
      ? ticketekListingExtractionSchema
      : connectorId === "ticketek-public" && workflowId === "collect_detail"
        ? ticketekDetailExtractionSchema
        : connectorId === "dunedinnz-public" && workflowId === "collect_events"
          ? regionalArgusEventExtractionSchema
          : connectorId === "auckland-airport-monthly" && workflowId === "collect_monthly_traffic"
            ? aucklandAirportMonthlyExtractionSchema
            : connectorId === "mot-airline-performance" && workflowId === "collect_monthly_performance"
            ? motAirlinePerformanceExtractionSchema
              : otaArgusConnectors.has(connectorId) && workflowId === "resolve_listing"
                ? otaResolveListingExtractionSchema
                : otaArgusConnectors.has(connectorId) && workflowId === "discover_listings"
                  ? otaDiscoverListingsExtractionSchema
                  : otaArgusConnectors.has(connectorId) && workflowId === "collect_rates"
                    ? otaCollectRatesExtractionSchema
                    : officialVenueConnectors.has(connectorId) && workflowId === "resolve_venue"
                      ? officialVenueResolveExtractionSchema
                      : officialVenueConnectors.has(connectorId) && workflowId === "collect_events"
                        ? officialVenueEventsExtractionSchema
                        : cruiseConnectors.has(connectorId) && workflowId === "collect_cruise_schedule"
                          ? publicCruiseScheduleExtractionSchema
                          : liveAirportConnectors.has(connectorId) && workflowId === "collect_flights"
                            ? publicAirportFlightBoardExtractionSchema
                            : universityKeyDateConnectors.has(connectorId) && workflowId === "collect_key_dates"
                              ? publicUniversityKeyDatesExtractionSchema
              : null;
  if (sourceSchema) {
    const parsed = sourceSchema.safeParse(data);
    if (!parsed.success) {
      throw new Error(`Argus returned invalid ${expected.dataSchema} data: ${parsed.error.issues[0]?.message ?? "schema validation failed"}`);
    }
  }
}

function expectedArgusDataContract(
  connectorId: ArgusConnectorId,
  workflowId: ArgusWorkflowId,
): ArgusDataContract {
  const key = `${connectorId}:${workflowId}`;
  const contract = argusDataContracts[key as keyof typeof argusDataContracts];
  if (!contract) throw new Error(`Unsupported Argus connector workflow ${key}`);
  return contract;
}

async function jsonResponse<T>(response: Response): Promise<T & { error?: string; message?: string }> {
  const text = await response.text();
  if (!text) return {} as T & { error?: string; message?: string };
  try {
    return JSON.parse(text) as T & { error?: string; message?: string };
  } catch {
    throw new Error(`Argus returned invalid JSON with HTTP ${response.status}`);
  }
}

function failedResponse(
  httpStatus: number,
  body: { error?: string | { message?: string }; message?: string },
): { ok: false; httpStatus: number; message: string } {
  const nestedMessage = body.error && typeof body.error === "object" ? body.error.message : undefined;
  return {
    ok: false,
    httpStatus,
    message: body.message ?? nestedMessage ?? (typeof body.error === "string" ? body.error : `Argus returned HTTP ${httpStatus}`),
  };
}

function argusJobRequest(environment: Environment, input: ArgusCaptureInput) {
  return {
    contract_version: "1.0",
    idempotency_key: input.traceId,
    ...(environment.NODE_ENV === "development" ? { purpose: "development_technical_validation" } : {}),
    captures: [{
      contract_version: "1.0",
      trace_id: input.traceId,
      connector_id: input.connectorId,
      workflow_id: input.workflowId,
      url: input.url,
      ...(input.entryUrl === undefined ? {} : { entry_url: input.entryUrl }),
      ...(input.startDate === undefined ? {} : { start_date: input.startDate }),
      ...(input.endDate === undefined ? {} : { end_date: input.endDate }),
      ...(input.from === undefined ? {} : { from: input.from }),
      ...(input.to === undefined ? {} : { to: input.to }),
      ...(input.academicYear === undefined ? {} : { academic_year: input.academicYear }),
      ...(input.searchQuery === undefined ? {} : { search_query: input.searchQuery }),
      ...(input.checkIn === undefined ? {} : { check_in: input.checkIn }),
      ...(input.checkOut === undefined ? {} : { check_out: input.checkOut }),
      ...(input.adults === undefined ? {} : { adults: input.adults }),
      ...(input.children === undefined ? {} : { children: input.children }),
      ...(input.units === undefined ? {} : { units: input.units }),
      ...(input.currency === undefined ? {} : { currency: input.currency }),
      timeout_ms: input.timeoutMs ?? environment.ARGUS_TIMEOUT_MS,
      evidence_mode: "html",
      ...(input.maxRecords === undefined ? {} : { max_records: Math.min(500, Math.max(1, input.maxRecords)) }),
    }],
    execution_profile: "self_hosted",
    egress_profile_id: "direct",
    retry: { max_attempts: input.maxAttempts ?? 1, base_delay_ms: 500 },
  };
}

function requestFailure(error: unknown): { ok: false; httpStatus: number; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const timeout = error instanceof DOMException && error.name === "TimeoutError" || /timed? ?out|timeout|aborted/i.test(message);
  return { ok: false, httpStatus: timeout ? 504 : 503, message: `Argus request failed: ${message}` };
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
