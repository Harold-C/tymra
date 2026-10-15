import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { pilotManifestSchema, OBSERVATION_PILOT_KEY, OBSERVATION_QUEUE, pilotStateSchema } from "./observation-pilot";
import { prepareObservationPilot, enqueueObservationTask } from "./observation-production";

const env = getEnvironment();
if (env.NODE_ENV !== "production" || new URL(env.ARGUS_API_BASE_URL).hostname !== "api.argus.nz") throw new Error("Production pilot requires the selected production environment");
const [operation, file, baselineFile] = process.argv.slice(2);
try {
  if (operation === "prepare") {
    if (!file || !baselineFile) throw new Error("Manifest and immutable baseline ledger required");
    const manifest = pilotManifestSchema.parse(JSON.parse(await readFile(file, "utf8")));
    const bytes = await readFile(baselineFile);
    const baseline = JSON.parse(bytes.toString());
    if (createHash("sha256").update(bytes).digest("hex") !== manifest.baselineLedgerSha256
      || baseline.entries?.length !== 42 || baseline.entries.some((entry: {state: string}) => entry.state !== "ACKED")
      || baseline.limits?.total !== 195 || baseline.automaticCollectionEnabled !== false) throw new Error("Baseline ledger mismatch");
    await prepareObservationPilot(manifest, new Date(Date.now() + 12 * 3600_000).toISOString());
    console.log(JSON.stringify({ prepared: true, automaticEnabled: false, carriedSpent: 42, remaining: 153 }));
  } else if (operation === "enqueue-canary") {
    const job = await enqueueObservationTask("canary");
    console.log(JSON.stringify({ jobId: job?.id ?? null, automaticEnabled: false }));
  } else if (operation === "close-canary") {
    const control = await prisma.scheduleDefinition.findUniqueOrThrow({ where: { key: OBSERVATION_PILOT_KEY } });
    const state = pilotStateSchema.parse(control.payload);
    await prisma.scheduleDefinition.update({ where: { id: control.id }, data: { enabled: false, payload: { ...state, canaryEnabled: false }, nextRunAt: null } });
    console.log(JSON.stringify({ canaryEnabled: false, automaticEnabled: false }));
  } else if (operation === "status") {
    const control = await prisma.scheduleDefinition.findUnique({ where: { key: OBSERVATION_PILOT_KEY } });
    const jobs = await prisma.job.findMany({ where: { queueName: OBSERVATION_QUEUE }, select: { id: true, status: true, payload: true, lastErrorCode: true } });
    console.log(JSON.stringify({ automaticEnabled: control?.enabled ?? false, state: control?.payload, reserved: jobs.length, remaining: 153 - jobs.length, jobs }));
  } else throw new Error("Use prepare, enqueue-canary, close-canary or status. No activation command is provided.");
} finally { await prisma.$disconnect(); }
