import { describe, expect, it, vi } from "vitest";
vi.mock("@tymra/db", () => ({ prisma: {}, Prisma: {} }));
import { selectedFixture, selectedMember } from "./selected-panel-fixtures";
import { selectedAnchors, selectedHash, selectedManifestSchema, selectedStateSchema, selectedTaskKey, nextSelectedTasks, selectedJobSchema, selectedCycle, selectedDailyLimit, type MemberProgress } from "../src/operations/selected-panel-plan";
import { resolveSelectedUnit, selectedInput } from "../src/operations/selected-panel-production";
const now = new Date("2026-10-16T06:00:00Z");
const unit = { externalId: "unit0", officialName: "Studio", unitType: "Hotel room", capacity: 2, bedrooms: null, bathrooms: 1, bedTypes: ["1 Queen"], amenities: [], entireOrShared: "PRIVATE" };
const identity = (units = [unit]) => ({ data_schema: "ota-public.resolve_listing", schema_version: "1.0.0", provider: "booking", sourceListingId: "selected-0",
  canonicalUrl: selectedMember().sourceUrl, canonicalName: "Selected property", address: "1 Test Road", city: "Christchurch", region: "Canterbury", territorialAuthority: null,
  postcode: null, countryCode: "NZ", latitude: null, longitude: null, propertyType: "Motel", units, observedAt: now.toISOString(), fieldSources: {}, warnings: ["BOOKING_INTERNAL_PROPERTY_ID=100"], quality: "complete" });
describe("selected sample formal collection", () => {
  const upgraded = (count = 3) => ({ ...selectedFixture(count), cadence: { version: "dual-window-weekly-v2" as const, startsOn: "2026-10-16", bookingBootstrapDaily: 24 as const, bookingSteadyDaily: 20 as const } });
  it("finishes the missing exact window before starting a fresh pair, including the Monday boundary", () => {
    const state = upgraded();
    const p = [{ memberId: "sample0", identityAt: now, unitExternalId: "unit0", lastQuoteAt: now,
      windows: [{ checkIn: "2026-12-01", finishedAt: now }] }];
    const tasks = nextSelectedTasks(state, p, new Set(), new Date("2026-10-19T06:00:00Z"));
    expect(tasks.filter(t => t.memberId === "sample0")).toMatchObject([{ checkIn: "2026-12-05", round: "2026-10-16" }]);
    expect(selectedCycle(state, new Date("2026-10-22T10:59:59Z")).round).toBe("2026-10-16");
    expect(selectedCycle(state, new Date("2026-10-22T11:00:00Z")).round).toBe("2026-10-23");
  });
  it("freezes both stay anchors through a cycle crossing a month boundary", () => {
    expect(selectedCycle(upgraded(), new Date("2026-11-02T00:00:00Z"))).toEqual({ round: "2026-10-30", anchors: ["2026-12-01", "2026-12-05"] });
    expect(selectedCycle(upgraded(), new Date("2026-11-06T00:00:00Z"))).toEqual({ round: "2026-11-06", anchors: ["2027-01-05", "2027-01-02"] });
  });
  it("uses 24 Booking calls only in the first seven NZ dates and 20 thereafter, leaving all other limits unchanged", () => {
    const s = upgraded();
    expect(selectedDailyLimit(s, "booking", 6, now)).toBe(24);
    expect(selectedDailyLimit(s, "booking", 6, new Date("2026-10-22T11:00:00Z"))).toBe(20);
    expect(selectedDailyLimit(s, "expedia", 6, now)).toBe(6);
    expect(selectedDailyLimit(s, "trip", 2, now)).toBe(2);
    expect(selectedDailyLimit(selectedFixture(), "booking", 6, now)).toBe(6);
  });
  it("covers 68 members' exact two windows every cycle for eight weeks with identity expiry and a month change", () => {
    const s = upgraded(68);
    s.manifest.members.forEach((m, i) => { m.source = i < 50 ? "booking" : i < 57 ? "expedia" : i < 64 ? "airbnb" : i < 67 ? "bookabach" : "trip"; });
    const p: MemberProgress[] = s.manifest.members.map(m => ({ memberId: m.id, lastQuoteAt: null, identityAt: null, unitExternalId: null, windows: [] }));
    const used = new Set<string>(), byCycle = new Map<string, Set<string>>();
    for (let day = 0; day < 56; day++) {
      const date = new Date(now.getTime() + day * 86400000), usedToday: Record<string, number> = {};
      for (let call = 0; call < 55; call++) {
        const time = new Date(date.getTime() + call * 60000);
        const task = nextSelectedTasks(s, p, used, time).find(t => (usedToday[t.sourceId] ?? 0) < selectedDailyLimit(s, t.sourceId, 6, time));
        if (!task) break;
        usedToday[task.sourceId] = (usedToday[task.sourceId] ?? 0) + 1; used.add(selectedTaskKey(task));
        const member = p.find(m => m.memberId === task.memberId)!;
        if (task.phase === "identity") { member.identityAt = time; member.unitExternalId = task.memberId; }
        else { member.lastQuoteAt = time; member.windows!.push({ checkIn: task.checkIn, finishedAt: time });
          const coverage = byCycle.get(task.round) ?? new Set(); coverage.add(`${task.memberId}:${task.checkIn}`); byCycle.set(task.round, coverage); }
      }
    }
    expect([...byCycle.values()].map(s => s.size)).toEqual(Array(8).fill(136));
  });
  it("accepts the full roster without the legacy 195 ceiling, but rejects any retry or total-limit change", () => {
    const s = selectedFixture(68); expect(s.manifest.members).toHaveLength(68);
    expect(() => selectedManifestSchema.parse({ ...s.manifest, totalExecutionLimit: 195 })).toThrow();
    expect(() => selectedManifestSchema.parse({ ...s.manifest, automaticRetries: true })).toThrow();
  });
  it("hashes labelled inputs identically after JSONB reorders nested object keys", () => {
    const a = selectedFixture(); a.manifest.members[0].labels = { z: 1, a: { y: 2, b: 3 } };
    a.manifestHash = selectedHash(a.manifest);
    const b = JSON.parse(JSON.stringify(a)); b.manifest.members[0].labels = { a: { b: 3, y: 2 }, z: 1 };
    expect(selectedStateSchema.parse(b).manifestHash).toBe(a.manifestHash);
  });
  it("blocks duplicate listings, probable aliases, unresolved active targets and off-platform URLs", () => {
    const s = selectedFixture();
    for (const alter of [
      () => { s.manifest.members[1].sourceListingId = s.manifest.members[0].sourceListingId; },
      () => { for (const m of s.manifest.members) m.physicalGroup = "same-unit"; },
      () => { s.manifest.members[0].expectedUnitId = null; s.manifest.members[0].expectedUnitName = null; },
      () => { s.manifest.members[0].sourceUrl = "https://wrong.example/"; },
    ]) { const clean = selectedFixture(); Object.assign(s, clean); alter(); expect(() => selectedManifestSchema.parse(s.manifest)).toThrow(); }
  });
  it("locks October anchors to Dec 1/5 and opens distinct future anchors next month", () => {
    expect(selectedAnchors(now)).toEqual(["2026-12-01", "2026-12-05"]);
    expect(selectedAnchors(new Date("2026-10-31T10:00:00Z"))).toEqual(selectedAnchors(now));
    expect(selectedAnchors(new Date("2026-11-02T00:00:00Z"))).toEqual(["2027-01-05", "2027-01-02"]);
  });
  it("starts a ready member without waiting for all other members and prioritizes unpriced members", () => {
    const s = selectedFixture();
    const p = [{ memberId: "sample0", lastQuoteAt: new Date(now.getTime() - 1000), identityAt: now, unitExternalId: "unit0" }];
    const tasks = nextSelectedTasks(s, p, new Set(), now);
    expect(tasks[0].memberId).toBe("sample1"); expect(tasks[0].phase).toBe("identity");
    expect(tasks.filter(t => t.memberId === "sample0").map(t => t.phase)).toEqual(["quote", "quote"]);
    const used = new Set(tasks.map(selectedTaskKey)); expect(nextSelectedTasks(s, p, used, now)).toHaveLength(0);
  });
  it("never automatically resumes held members, stopped sources or unsuccessful keys", () => {
    const s = selectedFixture();
    expect(nextSelectedTasks({ ...s, held: [{ memberId: "sample0", reason: "TIMEOUT" }] }, [], new Set(), now).every(t => t.memberId !== "sample0")).toBe(true);
    expect(nextSelectedTasks({ ...s, stoppedSources: ["booking"] }, [], new Set(), now)).toEqual([]);
    expect(nextSelectedTasks(s, [], new Set(), new Date("2026-10-15T00:00:00Z"))).toEqual([]);
  });
  it("keeps one/two night package context and maxAttempts=1 at the execution boundary", () => {
    const task = nextSelectedTasks(selectedFixture(), [], new Set(), now)[0];
    const quote = selectedJobSchema.parse({ ...task, phase: "quote", unitExternalId: "unit0" });
    const input = selectedInput({ ...selectedMember(), nights: 2 }, quote, "parent");
    expect(input).toMatchObject({ checkIn: "2026-12-01", checkOut: "2026-12-03", adults: 2, children: 0, units: 1, currency: "NZD", maxAttempts: 1 });
    expect(() => selectedJobSchema.parse({ ...quote, unitExternalId: null })).toThrow();
  });
  it("requires exact property and a single selected room, excluding dorms and upgrades", () => {
    expect(resolveSelectedUnit(selectedMember(), identity()).externalId).toBe("unit0");
    expect(() => resolveSelectedUnit(selectedMember(), { ...identity(), warnings: [] })).toThrow("BOOKING_PROPERTY_ID_UNVERIFIED");
    expect(() => resolveSelectedUnit(selectedMember(), identity([{ ...unit, externalId: "upgrade", officialName: "Luxury Suite" }]))).toThrow("SELECTED_ROOM_NOT_RETURNED");
    expect(() => resolveSelectedUnit({ ...selectedMember(), expectedUnitId: null }, identity([unit, { ...unit, externalId: "another" }]))).toThrow("UNIT_IDENTITY_AMBIGUOUS");
    expect(() => resolveSelectedUnit(selectedMember(), identity([{ ...unit, officialName: "Bed in dorm" }]))).toThrow("SELECTED_ROOM_NOT_RETURNED");
  });
});
