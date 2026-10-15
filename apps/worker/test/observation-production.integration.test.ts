import { beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
import { prisma } from "@tymra/db";
import { prepareObservationPilot, enqueueObservationTask, observationCapturePermission, observationInput, stopObservationObject } from "../src/operations/observation-production";
import { OBSERVATION_PILOT_KEY, OBSERVATION_QUEUE, pilotStateSchema, pilotCanonicalHash } from "../src/operations/observation-pilot";
import { fixtureManifest } from "./observation-pilot.test";

let sourceBefore: Awaited<ReturnType<typeof prisma.dataSource.findMany>> = [];

beforeEach(async () => {
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2080-10-16T00:00:00Z"));
  sourceBefore=await prisma.dataSource.findMany({where:{key:{in:["booking","expedia"]}}});
  await prisma.job.deleteMany({ where: { queueName: OBSERVATION_QUEUE } });
  await prisma.scheduleDefinition.deleteMany({ where: { key: OBSERVATION_PILOT_KEY } });
  for (const key of ["booking","expedia"]) await prisma.dataSource.upsert({where:{key},update:{enabled:false,lifecycle:"SUSPENDED",operationalStatus:"DEGRADED",dailyBudget:6,concurrencyLimit:1,environments:["PRODUCTION"],isDemo:false},create:{key,name:key,providerType:"OTA",sourceType:"OTA",acquisitionMethod:"PUBLIC_WEB_ARGUS_READ_ONLY",enabled:false,lifecycle:"SUSPENDED",operationalStatus:"DEGRADED",dailyBudget:6,concurrencyLimit:1,environments:["PRODUCTION"],isDemo:false}});
});
afterEach(async()=>{
  await prisma.job.deleteMany({where:{queueName:OBSERVATION_QUEUE}});
  await prisma.scheduleDefinition.deleteMany({where:{key:OBSERVATION_PILOT_KEY}});
  for(const s of sourceBefore)await prisma.dataSource.update({where:{id:s.id},data:{enabled:s.enabled,lifecycle:s.lifecycle,operationalStatus:s.operationalStatus,dailyBudget:s.dailyBudget,concurrencyLimit:s.concurrencyLimit,environments:s.environments,isDemo:s.isDemo,updatedAt:s.updatedAt}});
  vi.useRealTimers();
});
afterAll(async()=>{await prisma.$disconnect();});
describe("bounded production observation integration",()=>{
  it("verifies the same wire content after an actual PostgreSQL JSONB round trip",async()=>{
    const wire={result_sha256:"original-wire-hash",job_id:"one",items:[{z:2,a:1,offers:[{currency:"NZD",amount:16400}]}]};
    const rows=await prisma.$queryRaw<Array<{payload:unknown}>>`SELECT ${JSON.stringify(wire)}::jsonb AS payload`;
    expect(pilotCanonicalHash(rows[0].payload)).toBe(pilotCanonicalHash(wire));
  });
  it("creates disabled intent, carries 42, and concurrent dispatch reserves only one job",async()=>{
    const m=fixtureManifest();const before=await prisma.dataSource.findMany({where:{key:{in:["booking","expedia"]}}});
    await prepareObservationPilot(m,new Date(Date.now()+3600000).toISOString());
    expect(await enqueueObservationTask("scheduled")).toBeNull();
    const jobs=await Promise.all([enqueueObservationTask("canary"),enqueueObservationTask("canary")]);
    expect(jobs.filter(Boolean)).toHaveLength(1);expect(await prisma.job.count({where:{queueName:OBSERVATION_QUEUE}})).toBe(1);
    const c=await prisma.scheduleDefinition.findUniqueOrThrow({where:{key:OBSERVATION_PILOT_KEY}});
    expect(c.enabled).toBe(false);expect(pilotStateSchema.parse(c.payload).manifest.baselineSpent).toBe(42);
    expect(await prisma.dataSource.findMany({where:{key:{in:["booking","expedia"]}}})).toEqual(before);
  });
  it("canary tasks are idempotent, rates follow identity, no tenth task is invented",async()=>{
    await prepareObservationPilot(fixtureManifest(),new Date(Date.now()+3600000).toISOString());
    for(let i=0;i<9;i++){
      const job=await enqueueObservationTask("canary");expect(job).not.toBeNull();
      await prisma.job.update({where:{id:job!.id},data:{status:"SUCCEEDED"}});
    }
    expect(await enqueueObservationTask("canary")).toBeNull();expect(await prisma.job.count({where:{queueName:OBSERVATION_QUEUE}})).toBe(9);
  });
  it("holds an object without taking down unrelated objects or changing source permissions",async()=>{
    await prepareObservationPilot(fixtureManifest(),new Date(Date.now()+3600000).toISOString());
    await stopObservationObject("candidate0");const job=await enqueueObservationTask("canary");
    expect(JSON.stringify(job?.payload)).not.toContain("candidate0");
    expect((await prisma.dataSource.findUniqueOrThrow({where:{key:"expedia"}})).enabled).toBe(false);
  });
  it("validates exact capture context and closes permission without rearming it",async()=>{
    const m=fixtureManifest();const expiry=new Date(Date.now()+3600000).toISOString();await prepareObservationPilot(m,expiry);
    const job=(await enqueueObservationTask("canary"))!;const task=(job.payload as {taskKey:string}).taskKey;
    const source=await prisma.dataSource.findUniqueOrThrow({where:{key:job.sourceId!}});const input=observationInput(m,task,job.id);
    await expect(observationCapturePermission(job,input,source.id)).resolves.toBeUndefined();
    await expect(observationCapturePermission(job,{...input,url:"https://www.booking.com/other"},source.id)).rejects.toThrow("OBSERVATION_INPUT_CHANGED");
    await expect(observationCapturePermission(job,input,source.id,new Date(expiry))).rejects.toThrow("OBSERVATION_PERMISSION_CLOSED");
    const control=await prisma.scheduleDefinition.findUniqueOrThrow({where:{key:OBSERVATION_PILOT_KEY}});const state=pilotStateSchema.parse(control.payload);
    await prisma.scheduleDefinition.update({where:{id:control.id},data:{payload:{...state,canaryEnabled:false}}});
    await prepareObservationPilot(m,new Date(Date.now()+7200000).toISOString());
    await expect(observationCapturePermission(job,input,source.id)).rejects.toThrow("OBSERVATION_PERMISSION_CLOSED");
  });
});
