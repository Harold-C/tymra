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
  mapArgusJobResult,
} from "../src/clients/argus-client";

let server: http.Server | undefined;
const jobId = `job_${"a".repeat(32)}`;

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
  server = undefined;
});

describe("Argus async Job client", () => {
  it.each(["tampered", "wrong-job", "wrong-version", "non-terminal"])("rejects a %s result before persistence", async (scenario) => {
    const payload = {
      contract_version: scenario === "wrong-version" ? "2.0" : "1.0",
      job_id: scenario === "wrong-job" ? "another-job" : jobId,
      status: scenario === "non-terminal" ? "RUNNING" : "COMPLETED",
      items: [], error: null,
    };
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    server = http.createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ ...payload, ...(scenario === "tampered" ? { status: "FAILED" } : {}), result_sha256: hash }));
    });

    const response = await getArgusJobResult(await listenEnvironment(), jobId);
    assert.equal(response.ok, false);
    if (!response.ok) assert.equal(response.httpStatus, 502);
  });

  it.each(["wrong-item", "wrong-inner-trace", "cancelled"])("rejects a %s capture", (scenario) => {
    const result = { ...listingResult(), ...(scenario === "wrong-inner-trace" ? { trace_id: "another-trace" } : {}) };
    const job = {
      job_id: jobId, status: scenario === "cancelled" ? "CANCELLED" : "COMPLETED",
      result_sha256: "a".repeat(64), error: null,
      items: [{ trace_id: scenario === "wrong-item" ? "another-trace" : "ticketmaster-test", status: "COMPLETED", error_category: null, result }],
    };
    const response = mapArgusJobResult(job as Parameters<typeof mapArgusJobResult>[0], {
      traceId: "ticketmaster-test", connectorId: "ticketmaster-public", workflowId: "collect_listing",
    }, {} as Environment);
    assert.equal(response.ok, false);
    if (!response.ok) assert.equal(response.httpStatus, scenario === "cancelled" ? 409 : 502);
  });

  for (const connectorId of ["booking-public", "airbnb-public", "expedia-public", "wotif-public", "hotels-public", "bookabach-public", "vrbo-public", "agoda-public", "trip-public"] as const) {
    for (const workflowId of ["resolve_listing", "discover_listings", "collect_rates"] as const) {
      it.each(["missing", "unknown-version", "private-schema"])(`rejects a %s data marker for ${connectorId}/${workflowId}`, (scenario) => {
        const result = { ...listingResult(), connector_id: connectorId, workflow_id: workflowId,
          data: scenario === "missing" ? {} : {
            data_schema: scenario === "private-schema" ? "private-booking.collect_reservations" : `ota-public.${workflowId}`,
            schema_version: scenario === "unknown-version" ? "1.0.1" : "1.0.0",
          } };
        const job = { job_id: jobId, status: "COMPLETED", result_sha256: "a".repeat(64), error: null,
          items: [{ trace_id: result.trace_id, status: "COMPLETED", error_category: null, result }] };
        const response = mapArgusJobResult(job as Parameters<typeof mapArgusJobResult>[0], {
          traceId: String(result.trace_id), connectorId, workflowId,
        }, {} as Environment);
        assert.equal(response.ok, false);
        if (!response.ok) assert.match(response.message, /unexpected data contract/u);
      });
    }
  }

  it("submits, polls and maps a read-only Ticketmaster listing", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server = jobServer(async (request) => {
      requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
      return listingResult();
    });
    const environment = await listenEnvironment();
    environment.NODE_ENV = "development";

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
    assert.equal(requestBody?.purpose, "development_technical_validation");
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

    assert.equal(response.ok, false);
    if (response.ok) return;
    assert.equal(response.httpStatus, 502);
    assert.equal(response.message, "Argus returned unexpected data contract; expected ticketmaster-public.collect_listing@1.0.0");
    assert.equal(response.delivery?.jobId, "job_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
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

  it("submits and validates the shared regional event contract", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server = jobServer(async (request) => {
      requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
      return regionalEventResult();
    });
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "dunedinnz-test",
      connectorId: "dunedinnz-public",
      workflowId: "collect_events",
      url: "https://www.dunedinnz.com/visit/dunedin-events/upcoming-events",
      startDate: "2026-08-01",
      endDate: "2026-11-01",
      maxRecords: 100,
    });

    assert.equal(response.ok, true);
    const capture = (requestBody?.captures as Array<Record<string, unknown>>)[0]!;
    assert.equal(capture.connector_id, "dunedinnz-public");
    assert.equal(capture.workflow_id, "collect_events");
  });

  it("accepts the Auckland Airport monthly passenger contract", async () => {
    server = jobServer(async () => aucklandAirportMonthlyResult());
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "auckland-airport-monthly-test",
      connectorId: "auckland-airport-monthly",
      workflowId: "collect_monthly_traffic",
      url: "https://corporate.aucklandairport.co.nz/news/publications/monthly-traffic-updates",
      maxRecords: 13,
    });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.equal((response.payload.extracted as { records: unknown[] }).records.length, 1);
  });

  it("preserves the voluntary-coverage caveat in the Ministry of Transport contract", async () => {
    server = jobServer(async () => motAirlinePerformanceResult());
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "mot-airline-performance-test",
      connectorId: "mot-airline-performance",
      workflowId: "collect_monthly_performance",
      url: "https://www.transport.govt.nz/area-of-interest/air-transport/airline-on-time-performance",
      maxRecords: 100,
    });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.match((response.payload.extracted as { coverageCaveat: string }).coverageCaveat, /voluntary|participating/iu);
  });

  it("submits and validates the Booking listing identity contract", async () => {
    server = jobServer(async () => otaResolveListingResult());
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-resolve-test",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.equal((response.payload.extracted as { sourceListingId: string }).sourceListingId, "example-stay");
  });

  it("accepts an unresolved public OTA unit capacity without inventing a value", async () => {
    server = jobServer(async () => {
      const result = otaResolveListingResult();
      ((result.data as { units: Array<Record<string, unknown>> }).units[0]!).capacity = null;
      return result;
    });
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-resolve-test",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.equal((response.payload.extracted as { units: Array<{ capacity: number | null }> }).units[0]?.capacity, null);
  });

  it("requires and exposes an expiring noVNC session for a Booking CAPTCHA", async () => {
    const expiresAt = new Date(Date.now() + 300_000).toISOString();
    server = jobServer(async () => ({
      ...baseResult("booking-captcha-test", "resolve_listing", "booking-public"),
      ok: false,
      status: "challenge",
      data: null,
      challenge: {
        kind: "CAPTCHA",
        signals: ["recaptcha"],
        manual_session: {
          session_id: "manual-booking-captcha-test",
          no_vnc_url: "https://connect.argus.test/session/manual-booking-captcha-test",
          expires_at: expiresAt,
        },
      },
      error: { category: "ACCESS_CHALLENGE", message: "Operator action required", retryable: true },
    }));
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-captcha-test",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });

    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.deepEqual(response.payload.manualRequired, {
      reason: "CAPTCHA",
      sessionId: "manual-booking-captcha-test",
      noVncUrl: "https://connect.argus.test/session/manual-booking-captcha-test",
      expiresAt,
    });
  });

  it("rejects a test manual-session origin in production", async () => {
    server = jobServer(async () => ({
      ...baseResult("booking-production-origin", "resolve_listing", "booking-public"),
      ok: false,
      status: "challenge",
      data: null,
      challenge: {
        kind: "CAPTCHA",
        signals: ["recaptcha"],
        manual_session: {
          session_id: "manual-booking-production-origin",
          no_vnc_url: "https://connect.argus.test/session/manual-booking-production-origin",
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
      },
      error: { category: "ACCESS_CHALLENGE", message: "Operator action required", retryable: true },
    }));
    const environment = { ...await listenEnvironment(), NODE_ENV: "production" as const };
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-production-origin",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });
    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /invalid CAPTCHA manual-session contract/u);
  });

  it("returns a noVNC handoff immediately when an Argus Job waits for manual verification", async () => {
    const sessionId = `manual_${"b".repeat(32)}`;
    const expiresAt = new Date(Date.now() + 600_000).toISOString();
    server = http.createServer(async (request, response) => {
      if (request.method === "POST" && request.url === "/v1/jobs") {
        await body(request);
        return json(response, 202, { contract_version: "1.0", job_id: jobId, status: "QUEUED" });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}`) {
        return json(response, 200, {
          contract_version: "1.0", job_id: jobId, status: "WAITING_FOR_MANUAL",
          operator_action: { required: true, type: "novnc_handoff", issue_url: "/v1/handoffs", reason: "captcha", session_ttl_seconds: 900, session_id: sessionId, expires_at: expiresAt },
        });
      }
      if (request.method === "POST" && request.url === "/v1/handoffs") {
        const requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
        assert.equal(requestBody.job_id, jobId);
        assert.equal(requestBody.session_id, sessionId);
        return json(response, 201, { status: "ready", url: `https://connect.argus.test/vnc.html?session=${sessionId}`, expires_at: expiresAt, ttl_seconds: 600, session_id: sessionId });
      }
      json(response, 404, { error: "NOT_FOUND" });
    });
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-waiting-captcha-test",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });

    assert.equal(response.ok, false);
    if (response.ok) return;
    assert.deepEqual(response.manualRequired, {
      jobId, reason: "captcha", sessionId,
      noVncUrl: `https://connect.argus.test/vnc.html?session=${sessionId}`,
      expiresAt,
    });
  });

  it.each([
    "https://user:password@connect.argus.test/session/manual-booking-captcha-test",
    "https://connect.argus.test:8443/session/manual-booking-captcha-test",
  ])("rejects an unsafe CAPTCHA noVNC URL: %s", async (noVncUrl) => {
    server = jobServer(async () => ({
      ...baseResult("booking-captcha-unsafe-session", "resolve_listing", "booking-public"),
      ok: false,
      status: "challenge",
      data: null,
      challenge: {
        kind: "CAPTCHA",
        signals: ["recaptcha"],
        manual_session: {
          session_id: "manual-booking-captcha-test",
          no_vnc_url: noVncUrl,
          expires_at: new Date(Date.now() + 300_000).toISOString(),
        },
      },
      error: { category: "ACCESS_CHALLENGE", message: "Operator action required", retryable: true },
    }));
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-captcha-unsafe-session",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });

    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /invalid CAPTCHA manual-session contract/u);
  });

  it("rejects a CAPTCHA noVNC session that lasts longer than 15 minutes", async () => {
    server = jobServer(async () => ({
      ...baseResult("booking-captcha-long-session", "resolve_listing", "booking-public"),
      ok: false,
      status: "challenge",
      data: null,
      challenge: {
        kind: "CAPTCHA",
        signals: ["recaptcha"],
        manual_session: {
          session_id: "manual-booking-captcha-test",
          no_vnc_url: "https://connect.argus.test/session/manual-booking-captcha-test",
          expires_at: new Date(Date.now() + 901_000).toISOString(),
        },
      },
      error: { category: "ACCESS_CHALLENGE", message: "Operator action required", retryable: true },
    }));
    const environment = await listenEnvironment();

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-captcha-long-session",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });

    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /invalid CAPTCHA manual-session contract/u);
  });

  it("rejects a Booking CAPTCHA without a manual noVNC session", async () => {
    server = jobServer(async () => ({
      ...baseResult("booking-captcha-missing-session", "resolve_listing", "booking-public"),
      ok: false,
      status: "challenge",
      data: null,
      challenge: { kind: "CAPTCHA", signals: ["recaptcha"] },
      error: { category: "ACCESS_CHALLENGE", message: "Operator action required", retryable: true },
    }));
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-captcha-missing-session",
      connectorId: "booking-public",
      workflowId: "resolve_listing",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
    });

    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /without a manual noVNC session/u);
  });

  it.each([
    ["expedia-public", "expedia", "https://www.expedia.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information"],
    ["wotif-public", "wotif", "https://www.wotif.co.nz/Auckland-Hotels-Example.h12345.Hotel-Information"],
    ["hotels-public", "hotels", "https://nz.hotels.com/ho12345"],
    ["bookabach-public", "bookabach", "https://www.bookabach.co.nz/holiday-accommodation/p12345"],
    ["vrbo-public", "vrbo", "https://www.vrbo.com/12345"],
    ["agoda-public", "agoda", "https://www.agoda.com/example-hotel/hotel/auckland-nz.html"],
    ["trip-public", "trip", "https://nz.trip.com/hotels/auckland-hotel-detail-12345"],
  ] as const)("validates the %s listing identity contract", async (connectorId, provider, url) => {
    const traceId = `${provider}-resolve-test`;
    server = jobServer(async () => otaResolveListingResult({ traceId, connectorId, provider, url }));
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, { traceId, connectorId, workflowId: "resolve_listing", url });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    assert.equal((response.payload.extracted as { provider: string }).provider, provider);
  });

  it("accepts Expedia property identity when public room identity is explicitly not public", async () => {
    const traceId = "expedia-property-only-test";
    const url = "https://www.expedia.co.nz/Christchurch-Hotels-Novotel-Christchurch-Airport.h18258191.Hotel-Information";
    server = jobServer(async () => {
      const result = otaResolveListingResult({ traceId, connectorId: "expedia-public", provider: "expedia", url });
      const data = result.data as Record<string, unknown>;
      data.sourceListingId = "expedia:18258191";
      data.providerFamily = "EXPEDIA_GROUP";
      data.unitIdentityStatus = "not_public";
      data.units = [];
      data.quality = "partial";
      data.warnings = ["EXPEDIA_UNIT_IDENTITY_NOT_PUBLIC"];
      return result;
    });
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, { traceId, connectorId: "expedia-public", workflowId: "resolve_listing", url });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    const extraction = response.payload.extracted as { unitIdentityStatus: string; units: unknown[]; quality: string };
    assert.equal(extraction.unitIdentityStatus, "not_public");
    assert.deepEqual(extraction.units, []);
    assert.equal(extraction.quality, "partial");
  });

  it("preserves Agoda partial nightly prices without manufacturing a stay total", async () => {
    const traceId = "agoda-partial-rate-test";
    const url = "https://www.agoda.com/en-nz/novotel-christchurch-airport/hotel/christchurch-nz.html";
    server = jobServer(async () => {
      const result = otaCollectRatesResult("agoda-public", "agoda", traceId);
      const rate = (result.data as { rates: Array<Record<string, unknown>> }).rates[0]!;
      Object.assign(rate, {
        sourceListingId: "agoda:2402569",
        ratePlanExternalId: "agoda:2402569:room:1:rate:public",
        nightlyPriceMinor: 26_900,
        basePriceMinor: null,
        mandatoryFeesMinor: null,
        taxesMinor: null,
        totalPriceMinor: null,
        priceStatus: "PARTIAL",
        rateFence: "PUBLIC_SIGNED_OUT",
        qualityFlags: ["AGODA_NIGHTLY_PRICE_NOT_TOTALLED"],
        sourceUrl: url,
      });
      (result.data as Record<string, unknown>).sourceListingId = "agoda:2402569";
      return result;
    });
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, { traceId, connectorId: "agoda-public", workflowId: "collect_rates", url, checkIn: "2026-09-10", checkOut: "2026-09-12", adults: 2, children: 0, units: 1, currency: "NZD" });
    assert.equal(response.ok, true);
    if (!response.ok) return;
    const rate = (response.payload.extracted as { rates: Array<Record<string, unknown>> }).rates[0]!;
    assert.deepEqual({ nightlyPriceMinor: rate.nightlyPriceMinor, totalPriceMinor: rate.totalPriceMinor, priceStatus: rate.priceStatus, rateFence: rate.rateFence }, { nightlyPriceMinor: 26_900, totalPriceMinor: null, priceStatus: "PARTIAL", rateFence: "PUBLIC_SIGNED_OUT" });
  });

  it("sends bounded stay parameters and rejects inconsistent OTA totals", async () => {
    let requestBody: Record<string, unknown> | undefined;
    server = jobServer(async (request) => {
      requestBody = JSON.parse(await body(request)) as Record<string, unknown>;
      const result = otaCollectRatesResult();
      ((result.data as { rates: Array<Record<string, unknown>> }).rates[0]!).totalPriceMinor = 99_999;
      return result;
    });
    const environment = await listenEnvironment();
    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "booking-rates-test",
      connectorId: "booking-public",
      workflowId: "collect_rates",
      url: "https://www.booking.com/hotel/nz/example-stay.html",
      checkIn: "2026-09-10",
      checkOut: "2026-09-12",
      adults: 2,
      children: 0,
      units: 1,
      currency: "NZD",
      maxAttempts: 2,
      timeoutMs: 60_000,
    });
    assert.equal(response.ok, false);
    assert.match(response.ok ? "" : response.message, /invalid ota-public\.collect_rates data/u);
    if (!response.ok) assert.equal(response.delivery?.jobId, "job_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    const capture = (requestBody?.captures as Array<Record<string, unknown>>)[0]!;
    assert.deepEqual({ checkIn: capture.check_in, checkOut: capture.check_out, adults: capture.adults, units: capture.units, currency: capture.currency }, { checkIn: "2026-09-10", checkOut: "2026-09-12", adults: 2, units: 1, currency: "NZD" });
    assert.equal(capture.timeout_ms, 60_000);
    assert.deepEqual(requestBody?.retry, { max_attempts: 2, base_delay_ms: 500 });
    for (const removedField of ["context_url", "source_listing_id", "children_ages", "latitude", "longitude", "radius_km", "accommodation_ids", "language", "country_code", "booker_country", "booker_platform"]) {
      assert.equal(removedField in capture, false);
    }
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

  it("cancels a Job that exceeds its polling deadline and returns the result for ACK cleanup", async () => {
    let cancelled = false;
    server = http.createServer(async (request, response) => {
      if (request.method === "POST" && request.url === "/v1/jobs") {
        await body(request);
        return json(response, 202, { contract_version: "1.0", job_id: jobId, status: "QUEUED" });
      }
      if (request.method === "DELETE" && request.url === `/v1/jobs/${jobId}`) {
        cancelled = true;
        return json(response, 202, { contract_version: "1.0", job_id: jobId, status: "CANCEL_REQUESTED" });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}`) {
        return json(response, 200, { contract_version: "1.0", job_id: jobId, status: cancelled ? "CANCELLED" : "RUNNING" });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}/result` && cancelled) {
        return json(response, 200, {
          contract_version: "1.0",
          job_id: jobId,
          status: "CANCELLED",
          result_sha256: "c".repeat(64),
          items: [],
          error: null,
        });
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

    assert.equal(response.ok, false);
    if (response.ok) return;
    assert.equal(response.httpStatus, 504);
    assert.equal(response.message, "Argus job polling timed out");
    assert.equal(response.delivery?.jobId, jobId);
    assert.match(response.delivery?.resultSha256 ?? "", /^[a-f0-9]{64}$/u);
    assert.equal(cancelled, true);
  });

  it("scales the polling window with the requested Argus attempt count", async () => {
    const startedAt = Date.now();
    server = http.createServer(async (request, response) => {
      if (request.method === "POST" && request.url === "/v1/jobs") {
        await body(request);
        return json(response, 202, { contract_version: "1.0", job_id: jobId, status: "QUEUED" });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}`) {
        return json(response, 200, {
          contract_version: "1.0",
          job_id: jobId,
          status: Date.now() - startedAt >= 30 ? "COMPLETED" : "RUNNING",
        });
      }
      if (request.method === "GET" && request.url === `/v1/jobs/${jobId}/result`) {
        const itemResult = listingResult();
        return json(response, 200, {
          contract_version: "1.0", job_id: jobId, status: "COMPLETED",
          result_sha256: "d".repeat(64),
          items: [{ trace_id: itemResult.trace_id, status: "COMPLETED", result: itemResult, error_category: null }],
          error: null,
        });
      }
      json(response, 404, { error: "NOT_FOUND" });
    });
    const environment = { ...await listenEnvironment(), ARGUS_JOB_POLL_TIMEOUT_MS: 20 };

    const response = await captureBrowserTaskWithArgus(environment, {
      traceId: "ticketmaster-test",
      connectorId: "ticketmaster-public",
      workflowId: "collect_listing",
      url: "https://www.ticketmaster.co.nz/discover/christchurch",
      maxAttempts: 2,
    });

    assert.equal(response.ok, true);
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

  it("downloads named workbook evidence with the same integrity checks", async () => {
    const evidence = Buffer.from("synthetic workbook bytes", "utf8");
    const sha256 = createHash("sha256").update(evidence).digest("hex");
    server = http.createServer((request, response) => {
      assert.equal(request.headers.authorization, "Bearer argus-test-token-with-at-least-32-characters");
      if (request.method === "GET" && request.url === "/v1/event-captures/trace-download/evidence/report") {
        response.writeHead(200, {
          "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-argus-content-sha256": sha256,
        });
        return response.end(evidence);
      }
      json(response, 404, { error: "NOT_FOUND" });
    });
    const environment = await listenEnvironment();

    const content = await downloadArgusEvidence(environment, {
      kind: "download",
      evidenceId: "report",
      filename: "airport-monthly.xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sourceUrl: "https://example.test/airport-monthly.xlsx",
      traceId: "trace-download",
      relativePath: "results/argus/trace-download/airport-monthly.xlsx",
      storageRef: "argus-evidence:results/argus/trace-download/airport-monthly.xlsx",
      sha256,
      sizeBytes: evidence.byteLength,
      containsSensitiveData: false,
      createdAt: "2026-08-06T00:00:00.000Z",
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

function regionalEventResult(): Record<string, unknown> {
  const canonicalUrl = "https://www.dunedinnz.com/visit/dunedin-events/upcoming-events/example";
  return {
    ...baseResult("dunedinnz-test", "collect_events", "dunedinnz-public"),
    data: {
      data_schema: "regional-events-public.collect_events",
      schema_version: "1.0.0",
      extractor: "regional_events",
      kind: "event_listing",
      title: "Dunedin events",
      canonicalUrl: "https://www.dunedinnz.com/visit/dunedin-events/upcoming-events",
      market: "Dunedin",
      events: [{ eventId: "dunedinnz:example", title: "Dunedin Festival", canonicalUrl, startsAt: "2026-08-20", endsAt: "2026-08-20", timePrecision: "DATE", venue: null, address: null, city: "Dunedin", region: "Otago", category: "Festival", description: null, status: "SCHEDULED", fieldSources: { title: "event card" } }],
      totalEvents: 1,
      truncated: false,
      quality: "partial",
      missingFields: ["events[0].venue"],
      warnings: [],
      fieldSources: { events: "listing page" },
    },
  };
}

function aucklandAirportMonthlyResult(): Record<string, unknown> {
  return {
    ...baseResult("auckland-airport-monthly-test", "collect_monthly_traffic", "auckland-airport-monthly"),
    data: {
      data_schema: "auckland-airport-monthly.collect_monthly_traffic",
      schema_version: "1.0.0",
      sourceUrl: "https://corporate.aucklandairport.co.nz/monthly-report.pdf",
      records: [{ period: "2026-06", domesticPassengers: 700000, internationalPassengers: 900000, totalPassengers: 1600000, annualChangePercent: 4.5, fieldSources: { totalPassengers: "monthly report table" } }],
      totalRecords: 1,
      truncated: false,
      quality: "complete",
      warnings: [],
      fieldSources: { records: "monthly report table" },
    },
  };
}

function motAirlinePerformanceResult(): Record<string, unknown> {
  return {
    ...baseResult("mot-airline-performance-test", "collect_monthly_performance", "mot-airline-performance"),
    data: {
      data_schema: "mot-airline-performance.collect_monthly_performance",
      schema_version: "1.0.0",
      sourceUrl: "https://www.transport.govt.nz/airline-performance.xlsx",
      reportingBasis: "VOLUNTARY_PARTICIPATING_AIRLINES",
      coverageCaveat: "Voluntary participating-airline reporting; coverage is incomplete.",
      records: [{ period: "2026-06", originAirportCode: "AKL", destinationAirportCode: "ZQN", originName: "Auckland", destinationName: "Queenstown", scheduledFlights: 300, arrivalOnTimePercent: 78, departureOnTimePercent: 76, cancelledFlights: 5, cancellationPercent: 1.7, fieldSources: { arrivalOnTimePercent: "workbook route row" } }],
      totalRecords: 1,
      truncated: false,
      quality: "complete",
      warnings: [],
      fieldSources: { records: "official workbook" },
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

function otaResolveListingResult(input: { traceId: string; connectorId: string; provider: string; url: string } = { traceId: "booking-resolve-test", connectorId: "booking-public", provider: "booking", url: "https://www.booking.com/hotel/nz/example-stay.html" }): Record<string, unknown> {
  return {
    ...baseResult(input.traceId, "resolve_listing", input.connectorId),
    data: {
      data_schema: "ota-public.resolve_listing",
      schema_version: "1.0.0",
      provider: input.provider,
      sourceListingId: "example-stay",
      canonicalUrl: input.url,
      canonicalName: "Example Stay",
      address: "42 Example Street, Christchurch 8011",
      city: "Christchurch",
      region: "Canterbury",
      territorialAuthority: "Christchurch City",
      postcode: "8011",
      countryCode: "NZ",
      latitude: -43.532,
      longitude: 172.636,
      propertyType: "HOTEL",
      units: [{ externalId: "double-room", officialName: "Double Room", unitType: "HOTEL_ROOM", capacity: 2, bedrooms: 1, bathrooms: 1, bedTypes: ["queen"], amenities: ["wifi"], entireOrShared: "PRIVATE" }],
      observedAt: "2026-08-07T00:00:00.000Z",
      fieldSources: { canonicalName: "heading", address: "property details" },
      warnings: [],
      quality: "complete",
    },
  };
}

function otaCollectRatesResult(connectorId = "booking-public", provider = "booking", traceId = "booking-rates-test"): Record<string, unknown> {
  return {
    ...baseResult(traceId, "collect_rates", connectorId),
    data: {
      data_schema: "ota-public.collect_rates",
      schema_version: "1.0.0",
      provider,
      sourceListingId: "example-stay",
      rates: [{ sourceListingId: "example-stay", unitExternalId: "double-room", checkIn: "2026-09-10", checkOut: "2026-09-12", currency: "NZD", basePriceMinor: 40_000, mandatoryFeesMinor: 2_000, taxesMinor: 6_000, optionalFeesMinor: 0, totalPriceMinor: 48_000, availabilityStatus: "AVAILABLE", restrictionReason: null, minimumStay: null, mealPlan: "ROOM_ONLY", cancellationPolicy: "FLEXIBLE", paymentTerms: "PAY_LATER", rateFence: "PUBLIC", sourceUrl: "https://www.booking.com/hotel/nz/example-stay.html", collectedAt: "2026-08-07T00:00:00.000Z", qualityFlags: [], fieldSources: { totalPriceMinor: "rate card" } }],
      observedAt: "2026-08-07T00:00:00.000Z",
      warnings: [],
      quality: "complete",
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
  if (status === 200 && value && typeof value === "object" && "items" in value && "result_sha256" in value) {
    const { result_sha256: _placeholder, ...payload } = value;
    value = { ...payload, result_sha256: createHash("sha256").update(JSON.stringify(payload)).digest("hex") };
  }
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

async function body(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
