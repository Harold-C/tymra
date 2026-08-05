import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "vitest";
import type { Environment } from "@tymra/config";
import {
  acknowledgeArgusJobResult,
  captureBrowserTaskWithArgus,
  captureTicketmasterListingWithArgus,
  downloadArgusEvidence,
  getArgusJobResult,
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
    let requestBody: Record<string, unknown> | undefined;
    server = jobServer(async (request) => {
      requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
      return ticketmasterDetailResult();
    });
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "ticketmaster-detail-test",
      connectorId: "ticketmaster-public",
      workflowId: "collect_detail",
      url: "https://www.ticketmaster.co.nz/example/event/2400000000000001",
      entryUrl: "https://www.ticketmaster.co.nz/discover/christchurch",
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
    const capture = (requestBody?.captures as Array<Record<string, unknown>>)[0]!;
    assert.equal(capture.entry_url, "https://www.ticketmaster.co.nz/discover/christchurch");
  });

  it("rejects data from the wrong connector schema version before normalisation", async () => {
    server = jobServer(async () => ({
      ...listingResult(),
      data: {
        data_schema: "eventfinda-public.collect_listing",
        schema_version: "1.0.0",
        extractor: "eventfinda",
        kind: "listing",
        events: [],
      },
    }));
    const environment = await listenEnvironment();

    const response = await captureTicketmasterListingWithArgus(environment, {
      traceId: "ticketmaster-test",
      url: "https://www.ticketmaster.co.nz/discover/christchurch",
    });

    assert.deepEqual(response, {
      ok: false,
      httpStatus: 502,
      message: "Argus returned unexpected data contract; expected ticketmaster-public.collect_listing@1.0.0",
    });
  });

  it("accepts the registered OurAuckland detail contract", async () => {
    server = jobServer(async () => ourAucklandDetailResult());
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "ourauckland-detail-test",
      connectorId: "ourauckland-public",
      workflowId: "collect_detail",
      url: "https://ourauckland.aucklandcouncil.govt.nz/events/2026/08/japanese-film-screening/",
    });

    assert.equal(response.ok, true);
    if (!response.ok) return;
    const extraction = response.payload.extracted as { data_schema: string; occurrences: Array<{ timePrecision: string }> };
    assert.equal(extraction.data_schema, "ourauckland-public.collect_detail");
    assert.equal(extraction.occurrences[0]?.timePrecision, "DATETIME");
  });

  it("accepts and validates the full Lincoln key-dates contract", async () => {
    server = jobServer(async () => lincolnKeyDatesResult());
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "lincoln-key-dates-test",
      connectorId: "lincoln-university-key-dates",
      workflowId: "collect_key_dates",
      url: "https://www.lincoln.ac.nz/study/key-dates/2026-academic-key-dates/",
    });

    assert.equal(response.ok, true);
    if (!response.ok) return;
    const extraction = response.payload.extracted as { keyDates: Array<{ id: string }> };
    assert.equal(extraction.keyDates[0]?.id, "lincoln:2026:graduation:2026-05-01:2026-05-01");
  });

  it("rejects internally inconsistent Lincoln dates before normalisation", async () => {
    const invalid = lincolnKeyDatesResult();
    const data = invalid.data as { keyDates: Array<Record<string, unknown>> };
    data.keyDates[0]!.demandRelevant = false;
    server = jobServer(async () => invalid);
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "lincoln-key-dates-test",
      connectorId: "lincoln-university-key-dates",
      workflowId: "collect_key_dates",
      url: "https://www.lincoln.ac.nz/study/key-dates/2026-academic-key-dates/",
    });

    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /invalid Lincoln key-dates data/u);
  });

  it("submits and validates the fixed Sporty event contract and date window", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server = jobServer(async (request) => {
      requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
      return sportyResult();
    });
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "sporty-test",
      connectorId: "sporty-school-sport-public",
      workflowId: "collect_events",
      url: "https://www.sporty.co.nz/sscanterbury",
      startDate: "2026-08-01",
      endDate: "2026-09-30",
      maxRecords: 20,
    });

    assert.equal(response.ok, true);
    const capture = (requestBody?.captures as Array<Record<string, unknown>>)[0]!;
    assert.equal(capture.start_date, "2026-08-01");
    assert.equal(capture.end_date, "2026-09-30");
    assert.equal(capture.max_records, 20);
  });

  it("accepts Ticketek listing/detail contracts and rejects internal identity drift", async () => {
    const invalid = ticketekDetailResult();
    const data = invalid.data as { occurrences: Array<Record<string, unknown>> };
    data.occurrences[0]!.seriesId = "ticketek:OTHER";
    server = jobServer(async () => invalid);
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "ticketek-detail-test",
      connectorId: "ticketek-public",
      workflowId: "collect_detail",
      url: "https://premier.ticketek.co.nz/shows/show.aspx?sh=SHOW26",
      entryUrl: "https://premier.ticketek.co.nz/shows/whatson.aspx?d=NDays&dn=30",
    });

    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /invalid ticketek-public\.collect_detail data/u);
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

  it("acknowledges the exact persisted result hash and observes remote 410 cleanup", async () => {
    const resultSha256 = "b".repeat(64);
    let acknowledgementBody: Record<string, unknown> | undefined;
    let acknowledged = false;
    server = http.createServer(async (request, response) => {
      assert.equal(request.headers.authorization, "Bearer argus-test-token-with-at-least-32-characters");
      if (request.method === "POST" && request.url === `/v1/jobs/${jobId}/ack`) {
        acknowledgementBody = JSON.parse(await body(request)) as Record<string, unknown>;
        acknowledged = true;
        return json(response, 200, { contract_version: "1.0", job_id: jobId });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}/result` && acknowledged) {
        return json(response, 410, { error: "RESULT_ACKNOWLEDGED" });
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
    assert.deepEqual(await getArgusJobResult(environment, jobId), {
      ok: false,
      httpStatus: 410,
      message: "RESULT_ACKNOWLEDGED",
    });
  });

  it("downloads evidence only when its size and hashes match", async () => {
    const evidence = Buffer.from("retained Argus evidence", "utf8");
    const sha256 = createHash("sha256").update(evidence).digest("hex");
    server = http.createServer((request, response) => {
      assert.equal(request.headers.authorization, "Bearer argus-test-token-with-at-least-32-characters");
      if (request.method === "GET" && request.url === "/v1/event-captures/trace-1/evidence/html") {
        response.writeHead(200, { "content-type": "text/html", "x-argus-content-sha256": sha256 });
        return response.end(evidence);
      }
      json(response, 404, { error: "NOT_FOUND" });
    });
    const environment = await listenEnvironment();

    const content = await downloadArgusEvidence(environment, {
      kind: "html",
      traceId: "trace-1",
      relativePath: "trace-1/page.html",
      storageRef: "argus-evidence:trace-1/page.html",
      sha256,
      sizeBytes: evidence.byteLength,
      containsSensitiveData: false,
      createdAt: "2026-08-02T00:00:00.000Z",
    });

    assert.deepEqual(content, evidence);
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
    data: {
      data_schema: "ticketmaster-public.collect_listing",
      schema_version: "1.0.0",
      extractor: "ticketmaster",
      kind: "listing",
      events: [],
    },
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
      data_schema: "ticketmaster-public.collect_detail",
      schema_version: "1.0.0",
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

function ourAucklandDetailResult(): Record<string, unknown> {
  return {
    ...baseResult("ourauckland-detail-test", "collect_detail", "ourauckland-public"),
    data: {
      data_schema: "ourauckland-public.collect_detail",
      schema_version: "1.0.0",
      extractor: "ourauckland",
      kind: "event_detail",
      id: "our-auckland:japanese-film-screening",
      title: "Japanese Film Screening",
      canonicalUrl: "https://ourauckland.aucklandcouncil.govt.nz/events/2026/08/japanese-film-screening/",
      occurrences: [{ startsAt: "2026-08-28T18:00:00", endsAt: "2026-08-28T20:00:00", timePrecision: "DATETIME", timezone: "Pacific/Auckland", scheduleText: "Friday 28 August 2026 6pm-8pm" }],
    },
  };
}

function lincolnKeyDatesResult(): Record<string, unknown> {
  const sourceUrl = "https://www.lincoln.ac.nz/study/key-dates/2026-academic-key-dates/";
  return {
    ...baseResult("lincoln-key-dates-test", "collect_key_dates", "lincoln-university-key-dates"),
    data: {
      data_schema: "lincoln-university-key-dates.collect_key_dates",
      schema_version: "1.0.0",
      extractor: "lincoln_university_key_dates",
      kind: "academic_key_dates",
      institution: "Lincoln University",
      academicYear: 2026,
      title: "2026 academic key dates",
      canonicalUrl: sourceUrl,
      connector: { id: "lincoln-university-key-dates", version: "1.0.0", browserMode: "headed" },
      rawVisibleText: "Friday 1 May Graduation",
      keyDates: [{
        id: "lincoln:2026:graduation:2026-05-01:2026-05-01",
        institution: "Lincoln University",
        academicYear: 2026,
        title: "Graduation",
        advertisedDate: "Friday 1 May",
        startsOn: "2026-05-01",
        endsOn: "2026-05-01",
        startsAt: "2026-05-01T00:00:00",
        endsAt: "2026-05-01T23:59:59",
        dateStatus: "RESOLVED",
        category: "GRADUATION",
        demandRelevant: true,
        sourceUrl,
        timezone: "Pacific/Auckland",
        rawVisibleText: "Friday 1 May Graduation",
        fieldSources: { title: "table cell" },
      }],
      quality: "complete",
      missingFields: [],
      warnings: [],
      fieldSources: { keyDates: "academic dates table" },
    },
  };
}

function sportyResult(): Record<string, unknown> {
  const canonicalUrl = "https://www.sporty.co.nz/sscanterbury";
  return {
    ...baseResult("sporty-test", "collect_events", "sporty-school-sport-public"),
    data: {
      data_schema: "sporty-school-sport-public.collect_events",
      schema_version: "1.0.0",
      extractor: "sporty_school_sport",
      kind: "event_listing",
      title: "School Sport Canterbury",
      canonicalUrl,
      sourceOrganisation: "School Sport Canterbury",
      window: { startsOn: "2026-08-01", endsOn: "2026-09-30" },
      series: [{ seriesId: "sporty:ssc:event", title: "Winter Tournament", sport: "Athletics", genderGrade: "Secondary", sourceOrganisation: "School Sport Canterbury", canonicalUrl, sourceUpdated: null, imageUrl: null, description: null, fieldSources: { title: "fixture" } }],
      occurrences: [{ seriesId: "sporty:ssc:event", occurrenceId: "sporty:ssc:event:2026-08-20", title: "Winter Tournament", sport: "Athletics", genderGrade: "Secondary", venue: "Nga Puna Wai", address: null, locality: "Christchurch", region: "Canterbury", startsAt: "2026-08-20", endsAt: "2026-08-20", timePrecision: "DATE", timezone: "Pacific/Auckland", status: "SCHEDULED", canonicalUrl, sourceOrganisation: "School Sport Canterbury", sourceUpdated: null, imageUrl: null, description: null, canterburyHosted: true, fieldSources: { title: "fixture" } }],
      totalSeries: 1,
      totalOccurrences: 1,
      truncated: false,
      quality: "complete",
      missingFields: [],
      warnings: [],
      fieldSources: { series: "fixture", occurrences: "fixture" },
    },
  };
}

function ticketekDetailResult(): Record<string, unknown> {
  const canonicalUrl = "https://premier.ticketek.co.nz/shows/show.aspx?sh=SHOW26";
  return {
    ...baseResult("ticketek-detail-test", "collect_detail", "ticketek-public"),
    data: {
      data_schema: "ticketek-public.collect_detail",
      schema_version: "1.0.0",
      extractor: "ticketek",
      kind: "event_detail",
      title: "Example Show",
      canonicalUrl,
      series: { seriesId: "ticketek:SHOW26", title: "Example Show", category: "Theatre", imageUrl: null, canonicalUrl, status: "SCHEDULED", sourceUpdated: null, description: "A public event", fieldSources: { title: "fixture" } },
      occurrences: [{ occurrenceId: "ticketek:SHOW26:PERF1", seriesId: "ticketek:SHOW26", title: "Example Show", startsAt: "2026-08-20T19:30:00", endsAt: null, timePrecision: "DATETIME", timezone: "Pacific/Auckland", venue: "Isaac Theatre Royal", city: "Christchurch", region: "Canterbury", status: "SCHEDULED", ticketState: "AVAILABLE", canonicalUrl, fieldSources: { title: "fixture" } }],
      quality: "complete",
      missingFields: [],
      warnings: [],
      fieldSources: { series: "fixture", occurrences: "fixture" },
    },
  };
}

function baseResult(traceId: string, workflowId: string, connectorId = "ticketmaster-public"): Record<string, unknown> {
  return {
    contract_version: "1.0",
    ok: true,
    status: "success",
    trace_id: traceId,
    connector_id: connectorId,
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
