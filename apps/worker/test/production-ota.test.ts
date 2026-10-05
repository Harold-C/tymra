import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ source: vi.fn(), jobs: vi.fn(), startingJob: vi.fn(), runs: vi.fn(), rates: vi.fn(), executions: vi.fn(), artifacts: vi.fn(), parserCount: vi.fn(), listingCount: vi.fn(), schedule: vi.fn(), updateSource: vi.fn(), updateSchedule: vi.fn() }));
vi.mock("@tymra/db", async (original) => ({ ...await original<typeof import("@tymra/db")>(), prisma: { $transaction: async (fn: (tx: unknown) => unknown) => fn({ dataSource: { findUniqueOrThrow: mock.source, update: mock.updateSource }, job: { findMany: mock.jobs, findUniqueOrThrow: mock.startingJob }, collectionRun: { findMany: mock.runs }, listing: { count: mock.listingCount }, rateObservation: { count: mock.rates }, argusExecution: { findMany: mock.executions }, rawArtifact: { findMany: mock.artifacts, count: mock.parserCount }, scheduleDefinition: { findUniqueOrThrow: mock.schedule, update: mock.updateSchedule } }) } }));
import { enableProductionOtaSchedule, beginProductionOtaRepairAcceptance, isProductionOtaSchedule, otaIdentityRequiresDetail, otaSourceApproved, productionOtaPayload, OTA_PILOT_VERSION } from "../src/operations/production-ota";
import { OTA_REPAIR_ACCEPTANCE_VERSION } from "../src/operations/ota-health";

const source = { id: "booking-source", key: "booking", providerType: "OTA", sourceType: "OTA", enabled: true, isDemo: false, environments: ["PRODUCTION"], concurrencyLimit: 1, dailyBudget: 6, metadata: { productionOta: OTA_PILOT_VERSION }, accessMethod: "PUBLIC_WEB_ARGUS_READ_ONLY" };
const schedule = { key: "pilot-ota-booking-daily", jobType: "CATALOG_DISCOVERY", queueName: "ota-production", cronExpression: "daily", payload: productionOtaPayload("booking") };
beforeEach(() => {
  vi.resetAllMocks();
  mock.source.mockResolvedValue(source);
  mock.schedule.mockResolvedValue(schedule);
  mock.jobs.mockResolvedValue([1, 2].map((i) => ({ id: `job-${i}`, payload: schedule.payload, status: "SUCCEEDED", attemptCount: 1, maxAttempts: 1, createdAt: new Date() })));
  mock.startingJob.mockResolvedValue({ id: "cmuupnz9x0000ph5zhslv462d", sourceId: "booking", queueName: "ota-production", payload: schedule.payload, attemptCount: 1, maxAttempts: 1, createdAt: new Date(Date.now() - 60_000) });
  mock.runs.mockResolvedValue([1, 2].map((i) => ({ id: `run-${i}`, status: "SUCCEEDED", successCount: 1, failureCount: 0, finishedAt: new Date(), scope: { operation: i === 1 ? "NATIONAL_CATALOG_DISCOVERY" : "OTA_PANEL_RATE" } })));
  mock.rates.mockResolvedValue(1);
  mock.listingCount.mockResolvedValue(1);
  mock.parserCount.mockResolvedValue(0);
  mock.executions.mockResolvedValue([1, 2].map((i) => ({ id: i, collectionRunId: `run-${i}`, status: "COMPLETED", result: { result_sha256: "a".repeat(64) }, completedAt: new Date(Date.now() - 1_000), deliveryVerifiedAt: new Date(), submittedAt: new Date() })));
  mock.artifacts.mockResolvedValue([{ storageRef: "tymra-evidence:retained", parserFailure: false }]);
});
describe("production OTA pilot acceptance", () => {
  const revisions = { tymraRevision: "a".repeat(40), argusRevision: "b".repeat(40) };
  const startingJobId = "cmuupnz9x0000ph5zhslv462d";
  it("freezes a source-scoped repair window without changing any job, schedule or old evidence", async () => {
    const result = await beginProductionOtaRepairAcceptance("booking", startingJobId, revisions, "production");
    expect(result.mutationPerformed).toBe(true);
    expect(result.acceptanceWindow).toMatchObject({ version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId, ...revisions });
    expect(mock.updateSource).toHaveBeenCalledOnce();
    expect(mock.updateSource.mock.calls[0][0]).toMatchObject({ where: { id: source.id }, data: { metadata: { productionOta: OTA_PILOT_VERSION, productionOtaRepairAcceptance: result.acceptanceWindow } } });
    expect(mock.updateSchedule).not.toHaveBeenCalled();
    expect(mock.parserCount).not.toHaveBeenCalled();
  });
  it("allows an identical readback but never moves a frozen repair window past subsequent failures", async () => {
    const job = await mock.startingJob();
    const window = { version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId, startedAt: job.createdAt.toISOString(), authorizedAt: new Date().toISOString(), ...revisions };
    mock.source.mockResolvedValue({ ...source, metadata: { ...source.metadata, productionOtaRepairAcceptance: window } });
    expect((await beginProductionOtaRepairAcceptance("booking", startingJobId, revisions, "production")).mutationPerformed).toBe(false);
    await expect(beginProductionOtaRepairAcceptance("booking", startingJobId, { ...revisions, argusRevision: "c".repeat(40) }, "production")).rejects.toThrow("cannot be moved");
    expect(mock.updateSource).not.toHaveBeenCalled();
  });
  const previousJobId = "cmuv75n200000nz46nhskb1ke";
  const versionJobId = "cmuvlkn5f0000nznlsryt66pm";
  const versionRevisions = { ...revisions, argusRevision: "c".repeat(40) };
  const priorWindow = () => ({
    version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId: previousJobId,
    startedAt: new Date(Date.now() - 360_000).toISOString(), authorizedAt: new Date(Date.now() - 240_000).toISOString(), ...revisions,
  });
  it("appends an explicitly linked new revision without overwriting the original window or history", async () => {
    const original = priorWindow();
    const metadata = { ...source.metadata, productionOtaRepairAcceptance: original };
    mock.source.mockResolvedValue({ ...source, metadata });
    const result = await beginProductionOtaRepairAcceptance("booking", versionJobId, versionRevisions, "production", previousJobId);
    expect(result.mutationPerformed).toBe(true);
    expect(result.acceptanceWindow).toMatchObject({ startingJobId: versionJobId, previousStartingJobId: previousJobId, ...versionRevisions });
    expect(mock.updateSource.mock.calls[0][0].data.metadata).toEqual({ ...metadata, productionOtaRepairAcceptanceVersions: [result.acceptanceWindow] });
    expect(metadata.productionOtaRepairAcceptance).toEqual(original);
    expect(mock.updateSchedule).not.toHaveBeenCalled();
    expect(mock.parserCount).not.toHaveBeenCalled();
  });
  it("rejects a version append without its exact predecessor, changed code or later trial", async () => {
    const original = priorWindow();
    mock.source.mockResolvedValue({ ...source, metadata: { ...source.metadata, productionOtaRepairAcceptance: original } });
    await expect(beginProductionOtaRepairAcceptance("booking", versionJobId, versionRevisions, "production")).rejects.toThrow("cannot be moved");
    await expect(beginProductionOtaRepairAcceptance("booking", versionJobId, versionRevisions, "production", versionJobId)).rejects.toThrow("current frozen window");
    await expect(beginProductionOtaRepairAcceptance("booking", versionJobId, revisions, "production", previousJobId)).rejects.toThrow("Invalid OTA repair acceptance versions");
    const job = await mock.startingJob();
    mock.startingJob.mockResolvedValue({ ...job, createdAt: new Date(original.startedAt) });
    await expect(beginProductionOtaRepairAcceptance("booking", versionJobId, versionRevisions, "production", previousJobId)).rejects.toThrow("Invalid OTA repair acceptance versions");
    expect(mock.updateSource).not.toHaveBeenCalled();
  });
  it("requires the original window and makes an exact version retry idempotent", async () => {
    await expect(beginProductionOtaRepairAcceptance("booking", versionJobId, versionRevisions, "production", previousJobId)).rejects.toThrow("preserved original");
    const job = await mock.startingJob();
    const current = { version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId: versionJobId, previousStartingJobId: previousJobId, startedAt: job.createdAt.toISOString(), authorizedAt: new Date().toISOString(), ...versionRevisions };
    mock.source.mockResolvedValue({ ...source, metadata: { ...source.metadata, productionOtaRepairAcceptance: priorWindow(), productionOtaRepairAcceptanceVersions: [current] } });
    expect((await beginProductionOtaRepairAcceptance("booking", versionJobId, versionRevisions, "production", previousJobId)).mutationPerformed).toBe(false);
    expect(mock.updateSource).not.toHaveBeenCalled();
  });
  it("uses the new version for enablement but still rejects any parser failure in that version", async () => {
    const current = { version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId: versionJobId, previousStartingJobId: previousJobId, startedAt: new Date(Date.now() - 60_000).toISOString(), authorizedAt: new Date().toISOString(), ...versionRevisions };
    mock.source.mockResolvedValue({ ...source, metadata: { ...source.metadata, productionOtaRepairAcceptance: priorWindow(), productionOtaRepairAcceptanceVersions: [current] } });
    await enableProductionOtaSchedule("booking", "production");
    expect(mock.parserCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: new Date(current.startedAt) } }) }));
    mock.parserCount.mockResolvedValue(1);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("parser failure rate");
    expect(mock.updateSchedule).toHaveBeenCalledOnce();
  });
  it("rejects unreviewed source revisions, cross-source jobs, old jobs and active automatic plans", async () => {
    await expect(beginProductionOtaRepairAcceptance("booking", startingJobId, revisions, "development")).rejects.toThrow("requires production");
    await expect(beginProductionOtaRepairAcceptance("booking", startingJobId, { ...revisions, tymraRevision: "unknown" }, "production")).rejects.toThrow("exact job");
    const job = await mock.startingJob();
    mock.startingJob.mockResolvedValue({ ...job, sourceId: "expedia" });
    await expect(beginProductionOtaRepairAcceptance("booking", startingJobId, revisions, "production")).rejects.toThrow("recent exact bounded job");
    mock.startingJob.mockResolvedValue({ ...job, createdAt: new Date(0) });
    await expect(beginProductionOtaRepairAcceptance("booking", startingJobId, revisions, "production")).rejects.toThrow("recent exact bounded job");
    mock.schedule.mockResolvedValue({ ...schedule, enabled: true });
    await expect(beginProductionOtaRepairAcceptance("booking", startingJobId, revisions, "production")).rejects.toThrow("Disable the source schedule");
    expect(mock.updateSource).not.toHaveBeenCalled();
  });
  it("applies identical repair cutoffs to parser, challenge and positive evidence and still blocks a current parser failure", async () => {
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    mock.source.mockResolvedValue({ ...source, metadata: { ...source.metadata, productionOtaRepairAcceptance: { version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId, startedAt, authorizedAt: new Date().toISOString(), ...revisions } } });
    await enableProductionOtaSchedule("booking", "production");
    expect(mock.parserCount).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: { gte: new Date(startedAt) } }) }));
    expect(mock.executions).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ submittedAt: { gte: new Date(startedAt) } }) }));
    mock.parserCount.mockResolvedValue(1);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("parser failure rate");
  });
  it("rejects two older successes outside a newer repair window", async () => {
    mock.source.mockResolvedValue({ ...source, metadata: { ...source.metadata, productionOtaRepairAcceptance: { version: OTA_REPAIR_ACCEPTANCE_VERSION, startingJobId, startedAt: new Date(Date.now() - 1_000).toISOString(), authorizedAt: new Date().toISOString(), ...revisions } } });
    const jobs = await mock.jobs(); jobs[0].createdAt = new Date(Date.now() - 2_000); mock.jobs.mockResolvedValue(jobs);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("inside the acceptance window");
    expect(mock.updateSchedule).not.toHaveBeenCalled();
  });
  it("uses complete listing identities but requires details for search summaries and inferred capacity", () => {
    const identity = { countryCode: "NZ", address: "1 Example Street", latitude: -43, longitude: 172, warnings: [], units: [{ externalId: "room", unitType: "Queen room", capacity: 2 }] };
    expect(otaIdentityRequiresDetail(identity)).toBe(false);
    expect(otaIdentityRequiresDetail({ ...identity, units: [{ ...identity.units[0], unitType: "Search summary (not sellable)" }] })).toBe(true);
    expect(otaIdentityRequiresDetail({ ...identity, warnings: ["UNIT_CAPACITY_FROM_SEARCH_OCCUPANCY"] })).toBe(true);
    expect(otaIdentityRequiresDetail({ ...identity, countryCode: null })).toBe(true);
    expect(otaIdentityRequiresDetail({ ...identity, latitude: null })).toBe(true);
  });
  it("accepts exactly six daily contracts and rejects expanded scope and frequency", () => {
    for (const key of ["booking", "airbnb", "expedia", "bookabach", "agoda", "trip"]) expect(isProductionOtaSchedule({ ...schedule, key: `pilot-ota-${key}-daily`, payload: productionOtaPayload(key) })).toBe(true);
    expect(() => productionOtaPayload("vrbo")).toThrow();
    expect(isProductionOtaSchedule({ ...schedule, payload: { ...schedule.payload, maxDetails: 2 } })).toBe(false);
    expect(isProductionOtaSchedule({ ...schedule, cronExpression: "every-3-hours" })).toBe(false);
    expect(isProductionOtaSchedule({ ...schedule, payload: { ...schedule.payload, accountId: "synix-account" } })).toBe(false);
  });
  it("requires production source isolation and fixed capacity", () => {
    expect(otaSourceApproved(source)).toBe(true);
    for (const changed of [{ isDemo: true }, { accessMethod: "PARTNER_API" }, { concurrencyLimit: 2 }, { dailyBudget: 100 }, { environments: ["DEVELOPMENT"] }]) expect(otaSourceApproved({ ...source, ...changed })).toBe(false);
  });
  it("enables only the selected source after complete evidence", async () => {
    await enableProductionOtaSchedule("booking", "production");
    expect(mock.updateSchedule).toHaveBeenCalledOnce();
    expect(mock.source).toHaveBeenCalledWith({ where: { key: "booking" } });
    expect(mock.updateSource.mock.calls[0][0].where).toEqual({ id: source.id });
  });
  it("uses the fresh discovery association for cached identities and rejects an unrelated association", async () => {
    const runs = await mock.runs();
    mock.runs.mockResolvedValue(runs.map((run: object) => ({ ...run, jobId: "job-1", createdAt: new Date(Date.now() - 30_000) })));
    mock.listingCount.mockImplementation(query => query.where.OR?.some((branch: { OR?: { metadata: { equals: string } }[] }) =>
      branch.OR?.some(link => link.metadata.equals === "job-1")) ? 1 : 0);
    await enableProductionOtaSchedule("booking", "production");
    expect(mock.updateSchedule).toHaveBeenCalledOnce();
    mock.listingCount.mockResolvedValue(0);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("no positive listing discovery evidence");
    expect(mock.updateSchedule).toHaveBeenCalledOnce();
  });
  it.each(["FAILED", "PARTIAL", "CANCELLED"])("rejects terminal %s jobs", async (status) => {
    const jobs = await mock.jobs(); jobs[0].status = status; mock.jobs.mockResolvedValue(jobs);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("latest two");
    expect(mock.updateSchedule).not.toHaveBeenCalled();
  });
  it("rejects historical success, automatic retries and fixture payloads", async () => {
    const jobs = await mock.jobs(); jobs[0].attemptCount = 2; mock.jobs.mockResolvedValue(jobs);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("latest two");
    jobs[0].attemptCount = 1; jobs[0].createdAt = new Date(0);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("latest two");
  });
  it("rejects empty, unacknowledged, remote and parsing evidence", async () => {
    mock.rates.mockResolvedValue(0);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("no positive rate evidence");
    mock.rates.mockResolvedValue(1);
    const executions = await mock.executions(); executions[0].deliveryVerifiedAt = null;
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("verified delivery");
    executions[0].deliveryVerifiedAt = new Date();
    mock.artifacts.mockResolvedValue([{ storageRef: "argus-evidence:still-remote", parserFailure: false }]);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("retention");
    mock.artifacts.mockResolvedValue([{ storageRef: "tymra-evidence:retained", parserFailure: true }]);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("retention");
    expect(mock.updateSchedule).not.toHaveBeenCalled();
  });
  it("rejects ACK timestamps before completion, invalid wire hashes and missing run delivery", async () => {
    const executions = await mock.executions();
    executions[0].deliveryVerifiedAt = new Date(0);
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("verified delivery");
    executions[0].deliveryVerifiedAt = new Date(); executions[0].result.result_sha256 = "invalid";
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("verified delivery");
    executions[0].result.result_sha256 = "a".repeat(64); executions[0].collectionRunId = "unrelated-run";
    await expect(enableProductionOtaSchedule("booking", "production")).rejects.toThrow("verified delivery");
    expect(mock.updateSchedule).not.toHaveBeenCalled();
  });
});
