import { beforeAll, beforeEach, afterEach, afterAll, describe, it, expect, vi } from "vitest";
import { prisma } from "@tymra/db";
import { prepareObservationPilot, enqueueObservationTask, observationCapturePermission, observationInput, stopObservationObject, prepareObservationRepair, closeObservationRepair } from "../src/operations/observation-production";
import { OBSERVATION_PILOT_KEY, OBSERVATION_QUEUE, pilotStateSchema, pilotCanonicalHash, pilotTasks, pilotHash } from "../src/operations/observation-pilot";
import { fixtureManifest } from "./observation-pilot.test";

let sourceBefore: Awaited<ReturnType<typeof prisma.dataSource.findMany>> = [];

beforeAll(async () => { await prisma.$connect(); }); // Initialize before advancing Date decades ahead.
beforeEach(async () => {
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2080-10-16T00:00:00Z"));
  sourceBefore=await prisma.dataSource.findMany({where:{key:{in:["booking","expedia"]}}});
  await prisma.job.deleteMany({ where: { queueName: OBSERVATION_QUEUE } });
  await prisma.scheduleDefinition.deleteMany({ where: { key: OBSERVATION_PILOT_KEY } });
  for (const key of ["booking","expedia"]) await prisma.dataSource.upsert({where:{key},update:{enabled:false,lifecycle:"SUSPENDED",operationalStatus:"DEGRADED",dailyBudget:6,concurrencyLimit:1,environments:["PRODUCTION"],isDemo:false},create:{key,name:key,providerType:"OTA",sourceType:"OTA",acquisitionMethod:"PUBLIC_WEB_ARGUS_READ_ONLY",enabled:false,lifecycle:"SUSPENDED",operationalStatus:"DEGRADED",dailyBudget:6,concurrencyLimit:1,environments:["PRODUCTION"],isDemo:false}});
});
afterEach(async()=>{
  const owned=await prisma.job.findMany({where:{queueName:OBSERVATION_QUEUE},select:{id:true}});
  await prisma.argusExecution.deleteMany({where:{parentJobId:{in:owned.map(j=>j.id)}}});
  await prisma.job.deleteMany({where:{queueName:OBSERVATION_QUEUE}});
  await prisma.scheduleDefinition.deleteMany({where:{key:OBSERVATION_PILOT_KEY}});
  for(const s of sourceBefore)await prisma.dataSource.update({where:{id:s.id},data:{enabled:s.enabled,lifecycle:s.lifecycle,operationalStatus:s.operationalStatus,dailyBudget:s.dailyBudget,concurrencyLimit:s.concurrencyLimit,environments:s.environments,isDemo:s.isDemo,updatedAt:s.updatedAt}});
  vi.useRealTimers();
});
afterAll(async()=>{await prisma.$disconnect();});
describe("bounded production observation integration",()=>{
  const authorization={id:"verified-fix",candidateId:"candidate2",reason:"Parser repair verified offline",expectedReserved:7,expectedRemaining:146};
  async function heldPilot(){
    const manifest=fixtureManifest();await prepareObservationPilot(manifest,new Date(Date.now()+3600000).toISOString());
    for(const task of pilotTasks(manifest).filter(t=>t.mode==="canary" && (t.candidateId!=="candidate2" || t.workflow==="resolve_listing"))){
      const sourceId=manifest.candidates.find(c=>c.candidate.id===task.candidateId)!.candidate.source.toLowerCase();
      await prisma.job.create({data:{type:"RATE_COLLECTION",queueName:OBSERVATION_QUEUE,sourceId,maxAttempts:1,
        status:task.candidateId==="candidate2"?"DEAD_LETTER":"SUCCEEDED",createdAt:new Date(),
        idempotencyKey:`${OBSERVATION_PILOT_KEY}:${pilotHash(manifest)}:${task.key}`,
        payload:{observationPilot:OBSERVATION_PILOT_KEY,manifestHash:pilotHash(manifest),taskKey:task.key,sourceId}}});
    }
    await stopObservationObject("candidate2");
    const control=await prisma.scheduleDefinition.findUniqueOrThrow({where:{key:OBSERVATION_PILOT_KEY}});
    const state=pilotStateSchema.parse(control.payload);
    await prisma.scheduleDefinition.update({where:{id:control.id},data:{payload:{...state,canaryEnabled:false}}});
    return manifest;
  }
  it("preserves seven prior receipts, charges three new two-night repair jobs and releases only after verified delivery",async()=>{
    const m=await heldPilot();const before=await prisma.job.findMany({where:{queueName:OBSERVATION_QUEUE},orderBy:{id:"asc"}});
    await prepareObservationRepair(authorization,new Date(Date.now()+3600000).toISOString());
    const executions:string[]=[];
    for(let i=0;i<3;i++){
      const results=await Promise.all([enqueueObservationTask("repair"),enqueueObservationTask("repair")]);
      const jobs=results.filter(j=>j!==null);expect(jobs).toHaveLength(1);const job=jobs[0]!;
      expect(job.maxAttempts).toBe(1);expect(job.sourceId).toBe("booking");
      const control=await prisma.scheduleDefinition.findUniqueOrThrow({where:{key:OBSERVATION_PILOT_KEY}});
      const state=pilotStateSchema.parse(control.payload);const task=(job.payload as {taskKey:string}).taskKey;
      const input=observationInput(m,task,job.id,state.repairs);
      if(i>0){expect(input.checkOut).toBe(i===1?"2099-12-03":"2099-12-07");expect(input.adults).toBe(2);expect(input.unitExternalId).toBe("unit2");}
      const source=await prisma.dataSource.findUniqueOrThrow({where:{key:"booking"}});
      await expect(observationCapturePermission(job,input,source.id)).resolves.toBeUndefined();
      await prisma.job.update({where:{id:job.id},data:{status:"SUCCEEDED"}});
      const e=await prisma.argusExecution.create({data:{orchestrationKey:job.id,parentJobId:job.id,collectionRunId:`repair-test-${job.id}`,dataSourceId:source.id,argusJobId:`repair-test-${job.id}`,traceId:job.id,connectorId:"booking-public",workflowId:input.workflowId,requestedUrl:input.url,deadlineAt:new Date(Date.now()+3600000),submittedAt:new Date(),status:"COMPLETED"}});
      executions.push(e.id);
    }
    expect(await enqueueObservationTask("repair")).toBeNull();
    expect(await prisma.job.count({where:{queueName:OBSERVATION_QUEUE}})).toBe(10);
    expect((await closeObservationRepair(authorization.id)).passed).toBe(false);
    await prisma.argusExecution.updateMany({where:{id:{in:executions}},data:{deliveryVerifiedAt:new Date()}});
    expect(await closeObservationRepair(authorization.id)).toEqual({passed:true,held:false,repairEnabled:false,automaticEnabled:false});
    expect(await prisma.job.findMany({where:{id:{in:before.map(j=>j.id)}},orderBy:{id:"asc"}})).toEqual(before);
    expect((await prepareObservationRepair(authorization,new Date(Date.now()+7200000).toISOString())).enabled).toBe(false);
    expect(await enqueueObservationTask("repair")).toBeNull();expect(await enqueueObservationTask("canary")).toBeNull();
    const state=pilotStateSchema.parse((await prisma.scheduleDefinition.findUniqueOrThrow({where:{key:OBSERVATION_PILOT_KEY}})).payload);
    const scheduled=await enqueueObservationTask("scheduled",new Date("2099-10-19T05:00:00+13:00"));expect(scheduled).toBeNull();
    expect(state.manifest.baselineSpent).toBe(42);
  });
  it("rejects stale budgets, unchanged objects and disabled source capacity; another failure stops the repair",async()=>{
    await heldPilot();const expiry=new Date(Date.now()+3600000).toISOString();
    await expect(prepareObservationRepair({...authorization,expectedRemaining:153},expiry)).rejects.toThrow("REPAIR_BUDGET_CHANGED");
    await expect(prepareObservationRepair({...authorization,candidateId:"candidate0"},expiry)).rejects.toThrow("REPAIR_REQUIRES_HELD_OBJECT");
    await prepareObservationRepair(authorization,expiry);
    await prisma.dataSource.update({where:{key:"booking"},data:{dailyBudget:1}});
    expect(await enqueueObservationTask("repair")).toBeNull();
    await prisma.dataSource.update({where:{key:"booking"},data:{dailyBudget:6}});
    const job=(await enqueueObservationTask("repair"))!;expect((job.payload as {taskKey:string}).taskKey).toMatch(/:identity$/);
    await prisma.job.update({where:{id:job.id},data:{status:"DEAD_LETTER"}});await stopObservationObject("candidate2");
    expect(await enqueueObservationTask("repair")).toBeNull();
    expect(await closeObservationRepair(authorization.id)).toEqual({passed:false,held:true,repairEnabled:false,automaticEnabled:false});
  });
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
