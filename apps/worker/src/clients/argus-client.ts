import { createHash } from "node:crypto";

import type { Environment } from "@tymra/config";
import { lincolnKeyDatesExtractionSchema } from "../collection/lincoln-university-key-dates";
import {
  sportySchoolSportExtractionSchema,
  ticketekDetailExtractionSchema,
  ticketekListingExtractionSchema,
} from "../collection/school-sport-ticketek";

export type ArgusEvidencePointer = {
  kind: string;
  traceId: string;
  relativePath: string;
  storageRef: string;
  sha256: string;
  sizeBytes: number;
  containsSensitiveData: false;
  createdAt: string;
};

export type ArgusConnectorId = "ticketmaster-public" | "eventfinda-public" | "ourauckland-public" | "rbnz-fx" | "lincoln-university-key-dates" | "sporty-school-sport-public" | "ticketek-public";
export type ArgusWorkflowId = "collect_listing" | "collect_detail" | "collect_exchange_rates" | "collect_key_dates" | "collect_events";

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
} as const satisfies Record<string, ArgusDataContract>;

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
  challenge: { kind: string; signals: string[] } | null;
  error: { category: string; message: string; retryable: boolean } | null;
};

export type ArgusJobSummary = {
  job_id: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "COMPLETED_WITH_WARNINGS" | "FAILED" | "CANCEL_REQUESTED" | "CANCELLED";
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
  manualRequired: { reason: string } | null;
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
  maxRecords?: number;
};

export type CaptureResponse =
  | { ok: true; httpStatus: number; payload: ArgusBrowserTaskResult }
  | { ok: false; httpStatus: number; message: string };

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
  if (pointer.kind !== "html" && pointer.kind !== "screenshot") {
    throw new Error(`Argus evidence kind ${pointer.kind} cannot be retained`);
  }
  const response = await fetch(
    new URL(`/v1/event-captures/${encodeURIComponent(pointer.traceId)}/evidence/${pointer.kind}`, environment.ARGUS_API_BASE_URL),
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
  const deadline = Date.now() + environment.ARGUS_JOB_POLL_TIMEOUT_MS;

  try {
    const submission = await submitArgusCapture(environment, input);
    if (!submission.ok) return submission;
    const created = submission.job;

    let summary = created;
    while (!terminalJobStatuses.has(summary.status)) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return { ok: false, httpStatus: 504, message: "Argus job polling timed out" };
      await wait(Math.min(500, remaining));
      const statusResponse = await getArgusJob(environment, created.job_id);
      if (!statusResponse.ok) return statusResponse;
      summary = statusResponse.job;
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
    return mapArgusJobResult(job, input);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const timeout = error instanceof DOMException && error.name === "TimeoutError" || /timed? ?out|timeout|aborted/i.test(message);
    return { ok: false, httpStatus: timeout ? 504 : 503, message: `Argus request failed: ${message}` };
  }
}

export function mapArgusJobResult(
  job: ArgusJobResult,
  input: Pick<ArgusCaptureInput, "traceId" | "connectorId" | "workflowId">,
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
    return { ok: true, httpStatus: 200, payload: mapArgusResult(item.result, input.connectorId, input.workflowId) };
  } catch (error) {
    return {
      ok: false,
      httpStatus: 502,
      message: error instanceof Error ? error.message : "Argus returned an invalid connector result",
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
    manualRequired: manualRequired ? { reason: result.challenge?.kind ?? result.status } : null,
    readonlyOnly: true,
    externalSideEffectsPerformed: false,
    extracted: adaptExtraction(result.data, connectorId, workflowId, result.page?.title),
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
    captures: [{
      contract_version: "1.0",
      trace_id: input.traceId,
      connector_id: input.connectorId,
      workflow_id: input.workflowId,
      url: input.url,
      ...(input.entryUrl === undefined ? {} : { entry_url: input.entryUrl }),
      ...(input.startDate === undefined ? {} : { start_date: input.startDate }),
      ...(input.endDate === undefined ? {} : { end_date: input.endDate }),
      timeout_ms: environment.ARGUS_TIMEOUT_MS,
      evidence_mode: "html",
      ...(input.maxRecords === undefined ? {} : { max_records: Math.min(500, Math.max(1, input.maxRecords)) }),
    }],
    execution_profile: "self_hosted",
    egress_profile_id: "direct",
    retry: { max_attempts: 1, base_delay_ms: 100 },
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
