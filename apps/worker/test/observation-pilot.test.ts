import { describe, expect, it } from "vitest";
import { pilotManifestSchema, pilotHash, pilotCanonicalHash, pilotTasks, taskAllowed, type PilotManifest } from "../src/operations/observation-pilot";

export function fixtureManifest(): PilotManifest {
  return pilotManifestSchema.parse({ version: "christchurch-production-observation-v1", baselineLedgerSha256: "a".repeat(64), baselineSpent: 42, totalLimit: 195, additionalLimit: 90, canaryLimit: 10,
    remainingBuckets: { initial: 5, quotes: 100, weeklyIdentity: 28, retry: 20 }, start: "2099-10-19", end: "2099-11-15", stays: ["2099-12-01", "2099-12-05"],
    candidates: [0,1,2].map(i => ({ unitExternalId: `unit${i}`, candidate: { id: `candidate${i}`, name: `Sample ${i}`, source: i === 2 ? "BOOKING" : "EXPEDIA", sourceListingId: String(i),
      sourceUrl: i === 2 ? "https://www.booking.com/hotel/nz/example.html" : `https://www.expedia.co.nz/example.h${i}.Hotel-Information`,
      market: "Christchurch City", nights: i === 2 ? 2 : 1, cadence: "ONCE_PER_WEEK", accommodationType: "test", capacityGuests: 2, twoAdultStayEvidenceRef: "test-evidence", unit: {kind:"SOURCE_ROOM_ID",key:`unit${i}`,description:"reviewed",reviewed:true},
      evidenceRefs:["test"], evidenceObservedOn:"2099-10-15", identityConflicts:[], geography:{ locality:null,physicalUnitKey:null,precision:"SOURCE_SCOPED" }, possibleDuplicateGroup:null,concentrationGroup:null,quoteGaps:[],executionGaps:[],followUpGaps:[],reserve:{status:"GAP",candidateIds:[],reason:"observation only"} } })) });
}
describe("production observation plan", () => {
  it("permits only a bounded repair for its held object without reopening canary or scheduled work", () => {
    const manifest=fixtureManifest();
    const repair={id:"verified-fix",candidateId:"candidate2",enabled:true,expiresAt:"2099-10-18T00:00:00.000Z",reservedBefore:7,reason:"Reviewed repair"};
    const state={manifest,manifestHash:pilotHash(manifest),canaryEnabled:false,canaryExpiresAt:repair.expiresAt,heldCandidates:["candidate2"],stoppedSources:[],repairs:[repair]};
    const tasks=pilotTasks(manifest,state.repairs).filter(t=>t.mode==="repair");
    expect(tasks).toHaveLength(3);expect(tasks.every(t=>t.bucket==="retry" && t.candidateId==="candidate2")).toBe(true);
    expect(new Set(tasks.map(t=>t.key)).size).toBe(3);
    for(const task of tasks){
      expect(taskAllowed(state,false,task,new Date("2099-10-17T00:00:00Z"))).toBe(true);
      expect(taskAllowed(state,true,task,new Date("2099-10-17T00:00:00Z"))).toBe(false);
      expect(taskAllowed(state,false,task,new Date(repair.expiresAt))).toBe(false);
      expect(taskAllowed({...state,stoppedSources:["booking"]},false,task,new Date("2099-10-17T00:00:00Z"))).toBe(false);
    }
    expect(pilotTasks(manifest).filter(t=>t.mode==="repair")).toHaveLength(0);
  });
  it("preserves a verified receipt through JSONB key ordering while rejecting changed content", () => {
    const a={job_id:"one",items:[{price:16400,currency:"NZD"}],result_sha256:"wire"};
    const b={result_sha256:"wire",items:[{currency:"NZD",price:16400}],job_id:"one"};
    expect(pilotCanonicalHash(a)).toBe(pilotCanonicalHash(b));
    b.items[0].price=16600;expect(pilotCanonicalHash(a)).not.toBe(pilotCanonicalHash(b));
  });
  it("allocates 9 canary, 48 price and 12 weekly identity captures, preserving a 21-call margin inside 90", () => {
    const tasks = pilotTasks(fixtureManifest());
    expect(tasks).toHaveLength(69); expect(new Set(tasks.map(t=>t.key)).size).toBe(69);
    expect(tasks.filter(t=>t.mode === "canary")).toHaveLength(9);
    expect(tasks.filter(t=>t.mode === "scheduled" && t.bucket === "quotes")).toHaveLength(48);
    expect(tasks.filter(t=>t.bucket === "weeklyIdentity")).toHaveLength(12);
  });
  it("uses distinct cycle keys for repeated stays and never mixes stay durations", () => {
    const m=fixtureManifest();const tasks=pilotTasks(m).filter(t=>t.candidateId === "candidate2" && t.workflow === "collect_rates");
    expect(tasks).toHaveLength(18); expect(new Set(tasks.map(t=>t.checkIn)).size).toBe(2);
    expect(m.candidates[2].candidate.nights).toBe(2);
  });
  it("does not dispatch scheduled work while disabled, missed days, after end or held objects", () => {
    const manifest=fixtureManifest();const state={manifest,manifestHash:pilotHash(manifest),canaryEnabled:true,canaryExpiresAt:"2099-10-18T00:00:00.000Z",heldCandidates:[],stoppedSources:[]};
    const task=pilotTasks(manifest).find(t=>t.mode === "scheduled" && t.due === manifest.start)!;
    const due=new Date("2099-10-19T05:00:00+13:00");
    expect(taskAllowed(state,false,task,due)).toBe(false);expect(taskAllowed(state,true,task,due)).toBe(true);
    expect(taskAllowed(state,true,task,new Date("2099-10-20T05:00:00+13:00"))).toBe(false);
    expect(taskAllowed({...state,heldCandidates:[task.candidateId]},true,task,due)).toBe(false);
    expect(taskAllowed(state,true,task,new Date("2099-11-16T05:00:00+13:00"))).toBe(false);
  });
  it("closes canary at expiry regardless of schedule state", () => {
    const manifest=fixtureManifest();const state={manifest,manifestHash:pilotHash(manifest),canaryEnabled:true,canaryExpiresAt:"2099-10-18T00:00:00.000Z",heldCandidates:[],stoppedSources:[]};
    const task=pilotTasks(manifest).find(t=>t.mode === "canary")!;
    expect(taskAllowed(state,false,task,new Date("2099-10-17T00:00:00Z"))).toBe(true);
    expect(taskAllowed(state,true,task,new Date(state.canaryExpiresAt))).toBe(false);
  });
  it("rejects resetting baseline, increasing allowance, duplicate seats, invalid anchors and non-OTA URLs", () => {
    const m=fixtureManifest();
    for (const patch of [{baselineSpent:0},{additionalLimit:153},{stays:["2099-10-20","2099-12-05"]},{candidates:[m.candidates[0],m.candidates[0],m.candidates[2]]}]) expect(pilotManifestSchema.safeParse({...m,...patch}).success).toBe(false);
    m.candidates[0].candidate.sourceUrl="https://example.com/private"; expect(pilotManifestSchema.safeParse(m).success).toBe(false);
  });
});
