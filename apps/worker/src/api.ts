import { randomUUID } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import Fastify from "fastify";
import { z } from "zod";

import { WorkerRequestError, WorkerService } from "./services/worker-service";

const environment = getEnvironment();
const service = new WorkerService(environment);
const app = Fastify({ logger: true, requestIdHeader: "x-correlation-id", genReqId: (request) => request.headers["x-correlation-id"]?.toString() ?? randomUUID() });

const createSchema = z.object({
  input: z.string().trim().min(1).max(2_000),
  locale: z.enum(["en", "zh"]).default("en"),
  idempotencyKey: z.string().trim().min(8).max(200),
  email: z.string().trim().email().optional(),
  serviceConsent: z.boolean().optional(),
  marketingConsent: z.boolean().optional(),
});

app.post("/worker/preview", async (request, reply) => reply.code(202).send(await service.createPreview({ ...createSchema.omit({ email: true, serviceConsent: true, marketingConsent: true }).parse(request.body), ...requestIdentity(request) })));
app.post("/worker/analysis", async (request, reply) => reply.code(202).send(await service.createFormalAnalysis({ ...createSchema.required({ email: true, serviceConsent: true }).parse(request.body), ...requestIdentity(request) })));
app.post("/worker/analysis/:id/confirm", async (request) => service.confirmAnalysis(pathId(request.params), z.object({ sellableUnitId: z.string().min(1) }).parse(request.body)));
app.get("/worker/analysis/:id", async (request, reply) => sendFound(reply, await service.getAnalysis(pathId(request.params))));
app.get("/worker/analysis/:id/result", async (request, reply) => sendFound(reply, await service.getResult(pathId(request.params))));
app.post("/worker/analysis/:id/resend-link", async (request, reply) => reply.code(202).send(await service.resendLink(pathId(request.params))));
app.post("/worker/analysis/:id/cancel", async (request) => service.cancelAnalysis(pathId(request.params)));

app.get("/worker/sources", async () => prisma.dataSource.findMany({ orderBy: { key: "asc" }, select: { id: true, key: true, name: true, sourceType: true, lifecycle: true, internalApprovalStatus: true, legalRightsStatus: true, operationalStatus: true, enabled: true, environments: true, lastSuccessAt: true, healthSummary: true } }));
app.get("/worker/sources/:id/health", async (request, reply) => {
  const id = pathId(request.params);
  const source = await prisma.dataSource.findFirst({ where: { OR: [{ id }, { key: id }] } });
  if (!source) return reply.code(404).send({ error: "SOURCE_NOT_FOUND" });
  const checks = await prisma.sourceHealthCheck.findMany({ where: { dataSourceId: source.id }, orderBy: { checkedAt: "desc" }, take: 20 });
  return { source, checks };
});
app.get("/worker/markets", async () => prisma.marketCoverage.findMany({ orderBy: { key: "asc" } }));
app.get("/worker/markets/:key/coverage", async (request, reply) => sendFound(reply, await prisma.marketCoverage.findUnique({ where: { key: pathId(request.params) } })));
app.get("/worker/health", async () => service.health());
app.get("/worker/readiness", async (_request, reply) => {
  const health = await service.health();
  const ready = health.database.healthy && health.redis.healthy && health.argus.healthy && health.argus.ready;
  return reply.code(ready ? 200 : 503).send({ ready, dependencies: { database: health.database, redis: health.redis, argus: health.argus } });
});

app.setErrorHandler((error, request, reply) => {
  if (error instanceof WorkerRequestError) return reply.code(error.statusCode).send({ error: error.code, message: error.message, correlationId: request.id });
  if (error instanceof z.ZodError) return reply.code(422).send({ error: "VALIDATION_ERROR", issues: error.issues, correlationId: request.id });
  request.log.error(error);
  return reply.code(500).send({ error: "INTERNAL_ERROR", message: "The Worker request could not be completed", correlationId: request.id });
});

await app.listen({ host: environment.WORKER_API_HOST, port: environment.WORKER_API_PORT });

function pathId(params: unknown): string {
  const parsed = z.object({ id: z.string().min(1) }).or(z.object({ key: z.string().min(1) })).parse(params);
  return "id" in parsed ? parsed.id : parsed.key;
}

function sendFound(reply: { code(statusCode: number): { send(payload: unknown): unknown } }, value: unknown) {
  return value ? value : reply.code(404).send({ error: "NOT_FOUND" });
}

function requestIdentity(request: { ip: string; headers: Record<string, unknown> }) {
  const deviceHeader = request.headers["x-device-id"];
  return { ipAddress: request.ip, deviceId: typeof deviceHeader === "string" && deviceHeader ? deviceHeader : `anonymous:${request.ip}` };
}
