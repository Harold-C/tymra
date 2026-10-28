import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, expect, it } from "vitest";
import { prisma, Prisma } from "@tymra/db";
import { getEnvironment } from "@tymra/config";
import { assertIsolatedTestEnvironment } from "../../../test/isolation";
import { persistFailedArgusEvidence } from "../src/services/failed-argus-evidence";
import { acknowledgePersistedArgusResults } from "../src/services/argus-orchestrator";

assertIsolatedTestEnvironment();
afterAll(() => prisma.$disconnect());
const hash = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");

it.each([false, true])("retains failed diagnostics before ACK; corrupt evidence blocks ACK=%s", async corrupt => {
  const key = `failed-evidence-${randomUUID()}`, trace = `${key}-trace`, remote = `${key}-job`;
  const bytes = { html: Buffer.from("<p>Synthetic timeout diagnostics</p>"), screenshot: Buffer.from("synthetic-png-bytes") };
  const evidence = (["html", "screenshot"] as const).map(kind => ({ kind, traceId: trace,
    relativePath: `results/argus/${trace}/${kind === "html" ? "page.html" : "screenshot.png"}`,
    storageRef: `argus-evidence:results/argus/${trace}/${kind === "html" ? "page.html" : "screenshot.png"}`,
    sha256: hash(bytes[kind]), sizeBytes: bytes[kind].length, containsSensitiveData: false }));
  const payload = { contract_version: "1.0", job_id: remote, status: "FAILED", items: [{ trace_id: trace,
    status: "FAILED", result: { trace_id: trace, readonly_only: true, external_side_effects_performed: false, evidence }, error_category: "TIMEOUT" }],
    error: { category: "TIMEOUT", retryable: true, message: "Synthetic timeout" } };
  const wire = { ...payload, result_sha256: hash(JSON.stringify(payload)) };
  let acknowledgements = 0, purged = false, captures = 0;
  const server = createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer synthetic-failed-evidence-token-000000000") return response.writeHead(401).end();
    if (request.url === `/v1/jobs/${remote}/result`) {
      response.writeHead(purged ? 410 : 200, { "content-type": "application/json" });
      return response.end(JSON.stringify(purged ? { error: "PURGED" } : wire));
    }
    if (request.method === "POST" && request.url === `/v1/jobs/${remote}/ack`) {
      let body = ""; for await (const chunk of request) body += chunk;
      expect(JSON.parse(body).result_sha256).toBe(wire.result_sha256);
      acknowledgements++; purged = true;
      return response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ contract_version: "1.0", job_id: remote }));
    }
    const kind = request.url?.split("/").at(-1);
    if (request.url?.startsWith(`/v1/event-captures/${trace}/evidence/`) && (kind === "html" || kind === "screenshot")) {
      return response.writeHead(200, { "content-type": kind === "html" ? "text/html" : "image/png", "x-argus-content-sha256": hash(bytes[kind]) })
        .end(corrupt ? Buffer.from("tampered") : bytes[kind]);
    }
    if (request.method === "POST" && request.url === "/v1/jobs") captures++;
    response.writeHead(404).end();
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("Synthetic server not bound");
  const root = await mkdtemp(path.join(tmpdir(), "tymra-failed-evidence-"));
  const environment = { ...getEnvironment(), ARGUS_API_BASE_URL: `http://127.0.0.1:${address.port}`,
    ARGUS_API_TOKEN: "synthetic-failed-evidence-token-000000000", ARGUS_EVIDENCE_ROOT: root };
  const source = await prisma.dataSource.create({ data: { key, name: "Synthetic diagnostics", providerType: "PUBLIC", acquisitionMethod: "ISOLATED_TEST" } });
  const job = await prisma.job.create({ data: { type: "PUBLIC_DATA_COLLECTION", status: "FAILED", payload: { sourceId: key }, idempotencyKey: key, maxAttempts: 1 } });
  const run = await prisma.collectionRun.create({ data: { jobId: job.id, dataSourceId: source.id, mode: "MARKET_COVERAGE", status: "FAILED", errorCode: "TIMEOUT", scope: { original: true } } });
  const execution = await prisma.argusExecution.create({ data: { parentJobId: job.id, collectionRunId: run.id, dataSourceId: source.id,
    orchestrationKey: key, argusJobId: remote, traceId: trace, connectorId: "mot-airline-performance", workflowId: "collect_monthly_performance",
    requestedUrl: "https://www.transport.govt.nz/", status: "FAILED", errorCategory: "TIMEOUT", deadlineAt: new Date(), result: wire as unknown as Prisma.InputJsonValue } });
  try {
    await persistFailedArgusEvidence(environment, job.id);
    expect(await prisma.rawArtifact.count({ where: { collectionRunId: run.id } })).toBe(2);
    if (corrupt) await expect(acknowledgePersistedArgusResults(environment, job.id)).rejects.toThrow(/evidence integrity check failed/iu);
    else {
      await acknowledgePersistedArgusResults(environment, job.id);
      for (const p of evidence) expect(hash(await readFile(path.join(root, trace, p.kind === "html" ? "page.html" : "screenshot.png")))) .toBe(p.sha256);
      expect(await prisma.rawArtifact.count({ where: { collectionRunId: run.id, storageRef: { startsWith: "tymra-evidence:" } } })).toBe(2);
    }
    expect(acknowledgements).toBe(corrupt ? 0 : 1); expect(captures).toBe(0);
    const after = await prisma.argusExecution.findUniqueOrThrow({ where: { id: execution.id } });
    expect(after).toMatchObject({ status: "FAILED", errorCategory: "TIMEOUT", result: execution.result });
    expect(!!after.deliveryVerifiedAt).toBe(!corrupt);
    expect(await prisma.collectionRun.findUniqueOrThrow({ where: { id: run.id } })).toEqual(run);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    // Preserve terminal fixtures too; the explicitly disposable database owns
    // cleanup. Production history guards remain enabled throughout this test.
    await rm(root, { recursive: true, force: true });
  }
});
