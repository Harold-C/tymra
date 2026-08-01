import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "vitest";
import type { Environment } from "@tymra/config";
import {
  acknowledgeArgusJobResult,
  captureBrowserTaskWithArgus,
  captureTicketmasterListingWithArgus,
} from "../src/clients/argus-client";

let server: http.Server | undefined;
const jobId = `job_${"a".repeat(32)}`;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("Argus async Job client", () => {
  it("submits, polls and maps a read-only Ticketmaster listing", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server = jobServer(async (request) => {
      requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
      return listingResult();
    });
    const environment = await listenEnvironment();

    const result = await captureTicketmasterListingWithArgus(environment, {
      traceId: "ticketmaster-test",
      url: "https://www.ticketmaster.co.nz/discover/christchurch",
      maxRecords: 25,
    });

    assert.equal(result.httpStatus, 200);
    assert.equal(result.ok && result.payload.status, "success");
    assert.equal(result.ok && result.payload.evidence[0]?.storageRef, "argus-evidence:results/argus/ticketmaster-test/page.html");
    assert.equal(requestBody?.contract_version, "1.0");
    assert.equal(requestBody?.idempotency_key, "ticketmaster-test");
    const capture = (requestBody?.captures as Array<Record<string, unknown>>)[0]!;
    assert.equal(capture.connector_id, "ticketmaster-public");
    assert.equal(capture.workflow_id, "collect_listing");
    assert.equal(capture.max_records, 25);
  });

  it("adapts Argus Ticketmaster detail data to Tymra's existing extractor contract", async () => {
    server = jobServer(async () => ticketmasterDetailResult());
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "ticketmaster-detail-test",
      connectorId: "ticketmaster-public",
      workflowId: "collect_detail",
      url: "https://www.ticketmaster.co.nz/example/event/2400000000000001",
    });

    assert.equal(response.ok, true);
    if (!response.ok) return;
    const extraction = response.payload.extracted as {
      kind: string;
      events: Array<{ performers: Array<{ name: string }>; offers: Array<{ price: number }> }>;
    };
    assert.equal(extraction.kind, "event_detail");
    assert.equal(extraction.events[0]?.performers[0]?.name, "Example Artist");
    assert.equal(extraction.events[0]?.offers[0]?.price, 40);
  });

  it("uses the independent Job polling deadline", async () => {
    server = http.createServer(async (request, response) => {
      if (request.method === "POST" && request.url === "/v1/jobs") {
        await body(request);
        return json(response, 202, { contract_version: "1.0", job_id: jobId, status: "QUEUED" });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}`) {
        return json(response, 200, { contract_version: "1.0", job_id: jobId, status: "RUNNING" });
      }
      json(response, 404, { error: "NOT_FOUND" });
    });
    const environment = {
      ...await listenEnvironment(),
      ARGUS_JOB_POLL_TIMEOUT_MS: 20,
    };

    const response = await captureTicketmasterListingWithArgus(environment, {
      traceId: "ticketmaster-poll-timeout",
      url: "https://www.ticketmaster.co.nz/discover/christchurch",
    });

    assert.deepEqual(response, {
      ok: false,
      httpStatus: 504,
      message: "Argus job polling timed out",
    });
  });

  it("acknowledges the exact persisted result hash", async () => {
    const resultSha256 = "b".repeat(64);
    let acknowledgementBody: Record<string, unknown> | undefined;
    server = http.createServer(async (request, response) => {
      assert.equal(request.headers.authorization, "Bearer argus-test-token-with-at-least-32-characters");
      if (request.method === "POST" && request.url === `/v1/jobs/${jobId}/ack`) {
        acknowledgementBody = JSON.parse(await body(request)) as Record<string, unknown>;
        return json(response, 200, { contract_version: "1.0", job_id: jobId });
      }
      json(response, 404, { error: "NOT_FOUND" });
    });
    const environment = await listenEnvironment();

    const acknowledgement = await acknowledgeArgusJobResult(environment, jobId, resultSha256);

    assert.deepEqual(acknowledgement, { ok: true });
    assert.deepEqual(acknowledgementBody, {
      contract_version: "1.0",
      result_sha256: resultSha256,
    });
  });
});

function jobServer(
  result: (request: http.IncomingMessage) => Promise<Record<string, unknown>>,
): http.Server {
  return http.createServer(async (request, response) => {
    assert.equal(request.headers.authorization, "Bearer argus-test-token-with-at-least-32-characters");
    if (request.method === "POST" && request.url === "/v1/jobs") {
      const itemResult = await result(request);
      Reflect.set(server!, "itemResult", itemResult);
      return json(response, 202, { contract_version: "1.0", job_id: jobId, status: "QUEUED" });
    }
    if (request.method === "GET" && request.url === `/v1/jobs/${jobId}`) {
      return json(response, 200, { contract_version: "1.0", job_id: jobId, status: "COMPLETED" });
    }
    if (request.method === "GET" && request.url === `/v1/jobs/${jobId}/result`) {
      const itemResult = Reflect.get(server!, "itemResult") as Record<string, unknown>;
      return json(response, 200, {
        contract_version: "1.0",
        job_id: jobId,
        status: "COMPLETED",
        result_sha256: "b".repeat(64),
        items: [{
          trace_id: itemResult.trace_id,
          status: "COMPLETED",
          result: itemResult,
          error_category: null,
        }],
        error: null,
      });
    }
    json(response, 404, { error: "NOT_FOUND" });
  });
}

async function listenEnvironment(): Promise<Environment> {
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const port = (server!.address() as AddressInfo).port;
  return {
    ARGUS_API_BASE_URL: `http://127.0.0.1:${port}`,
    ARGUS_API_TOKEN: "argus-test-token-with-at-least-32-characters",
    ARGUS_TIMEOUT_MS: 5_000,
    ARGUS_JOB_POLL_TIMEOUT_MS: 30_000,
  } as Environment;
}

function listingResult(): Record<string, unknown> {
  return {
    ...baseResult("ticketmaster-test", "collect_listing"),
    page: {
      title: "Christchurch events",
      final_url: "https://www.ticketmaster.co.nz/discover/christchurch",
      html_bytes: 100,
      screenshot_bytes: 200,
    },
    data: { extractor: "ticketmaster", kind: "listing", events: [] },
    evidence: [{
      kind: "html",
      traceId: "ticketmaster-test",
      relativePath: "results/argus/ticketmaster-test/page.html",
      storageRef: "argus-evidence:results/argus/ticketmaster-test/page.html",
      sha256: "a".repeat(64),
      sizeBytes: 100,
      containsSensitiveData: false,
      createdAt: "2026-07-29T00:00:00.000Z",
    }],
  };
}

function ticketmasterDetailResult(): Record<string, unknown> {
  return {
    ...baseResult("ticketmaster-detail-test", "collect_detail"),
    page: {
      title: "Example Event",
      final_url: "https://www.ticketmaster.co.nz/example/event/2400000000000001",
      html_bytes: 100,
      screenshot_bytes: 200,
    },
    data: {
      extractor: "ticketmaster",
      kind: "detail",
      canonicalUrl: "https://www.ticketmaster.co.nz/example/event/2400000000000001",
      event: {
        eventId: "2400000000000001",
        title: "Example Event",
        sourceUrl: "https://www.ticketmaster.co.nz/example/event/2400000000000001",
        startsAt: "2026-08-01T19:00:00+12:00",
        endsAt: null,
        eventStatus: "https://schema.org/EventScheduled",
        venue: { name: "Example Venue", address: { addressLocality: "Christchurch" } },
        performers: ["Example Artist"],
        offers: { lowPrice: 40, highPrice: 60, priceCurrency: "NZD", availability: "https://schema.org/InStock", url: null },
      },
    },
  };
}

function baseResult(traceId: string, workflowId: string): Record<string, unknown> {
  return {
    contract_version: "1.0",
    ok: true,
    status: "success",
    trace_id: traceId,
    connector_id: "ticketmaster-public",
    workflow_id: workflowId,
    readonly_only: true,
    external_side_effects_performed: false,
    page: null,
    data: null,
    evidence: [],
    challenge: null,
    error: null,
  };
}

function json(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function body(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
