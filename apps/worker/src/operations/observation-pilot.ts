import { createHash } from "node:crypto";
import { z } from "zod";
import { addNzCalendarDays, evaluateObservationAdmission, observationCandidateSchema } from "@tymra/domain";

export const OBSERVATION_PILOT_KEY = "christchurch-three-observations-20261016";
export const OBSERVATION_QUEUE = "christchurch-observation";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const pilotManifestSchema = z.object({
  version: z.literal("christchurch-production-observation-v1"),
  baselineLedgerSha256: z.string().regex(/^[a-f0-9]{64}$/), baselineSpent: z.literal(42),
  totalLimit: z.literal(195), additionalLimit: z.literal(90), canaryLimit: z.literal(10),
  remainingBuckets: z.object({ initial: z.literal(5), quotes: z.literal(100), weeklyIdentity: z.literal(28), retry: z.literal(20) }).strict(),
  start: date, end: date, stays: z.tuple([date, date]),
  candidates: z.array(z.object({ candidate: observationCandidateSchema, unitExternalId: z.string().min(1) }).strict()).length(3),
}).strict().superRefine((m, ctx) => {
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (addNzCalendarDays(m.start, 27) !== m.end || m.stays[0] <= m.end || m.stays[1] <= m.stays[0]) invalid("Invalid four-week dates or stay anchors");
  if (new Set(m.candidates.map(c => c.candidate.id)).size !== 3) invalid("Duplicate observation seats");
  if (new Set(m.candidates.map(c => `${c.candidate.source}:${c.candidate.sourceListingId}`)).size !== 3) invalid("Duplicate listings");
  for (const { candidate: c } of m.candidates) {
    if (!["BOOKING", "EXPEDIA"].includes(c.source) || evaluateObservationAdmission(c).status !== "ELIGIBLE_FOR_OBSERVATION") invalid("Unreviewed candidate");
    const url = new URL(c.sourceUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.hostname !== (c.source === "BOOKING" ? "www.booking.com" : "www.expedia.co.nz")) invalid("Unapproved source URL");
  }
});
export type PilotManifest = z.infer<typeof pilotManifestSchema>;
export type PilotTask = { key: string; candidateId: string; workflow: "resolve_listing" | "collect_rates"; checkIn: string; due: string; bucket: "initial" | "quotes" | "weeklyIdentity"; mode: "canary" | "scheduled" };
export const pilotHash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function pilotTasks(manifest: PilotManifest): PilotTask[] {
  const m = pilotManifestSchema.parse(manifest);
  const result: PilotTask[] = [];
  for (const { candidate: c } of m.candidates) {
    result.push({ key: `canary:${c.id}:identity`, candidateId: c.id, workflow: "resolve_listing", checkIn: m.stays[0], due: m.start, bucket: "initial", mode: "canary" });
    for (const stay of m.stays) result.push({ key: `canary:${c.id}:${stay}`, candidateId: c.id, workflow: "collect_rates", checkIn: stay, due: m.start, bucket: "quotes", mode: "canary" });
    for (let week = 0; week < 4; week++) {
      // Identity on a different day: normal Expedia price days use four of six captures.
      result.push({ key: `week${week}:${c.id}:identity`, candidateId: c.id, workflow: "resolve_listing", checkIn: m.stays[0], due: addNzCalendarDays(m.start, week * 7 + 1), bucket: "weeklyIdentity", mode: "scheduled" });
      for (const offset of [0, 3]) for (const stay of m.stays) result.push({ key: `week${week}:${offset}:${c.id}:${stay}`, candidateId: c.id, workflow: "collect_rates", checkIn: stay, due: addNzCalendarDays(m.start, week * 7 + offset), bucket: "quotes", mode: "scheduled" });
    }
  }
  return result.sort((a,b) => a.due.localeCompare(b.due) || Number(a.workflow !== "resolve_listing") - Number(b.workflow !== "resolve_listing") || a.key.localeCompare(b.key));
}
export const pilotStateSchema = z.object({
  manifest: pilotManifestSchema, manifestHash: z.string(), canaryEnabled: z.boolean(), canaryExpiresAt: z.string().datetime(),
  heldCandidates: z.array(z.string()), stoppedSources: z.array(z.string()),
}).strict().refine(s => pilotHash(s.manifest) === s.manifestHash, "Manifest changed");
export const pilotJobSchema = z.object({ observationPilot: z.literal(OBSERVATION_PILOT_KEY), manifestHash: z.string(), taskKey: z.string(), sourceId: z.enum(["booking", "expedia"]) }).strict();
export function isObservationJob(payload: unknown) { return pilotJobSchema.safeParse(payload).success; }
export function nzDate(now: Date) { return new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit" }).format(now); }
export function taskAllowed(state: z.infer<typeof pilotStateSchema>, enabled: boolean, task: PilotTask, now: Date) {
  if (state.heldCandidates.includes(task.candidateId)) return false;
  const source = state.manifest.candidates.find(c => c.candidate.id === task.candidateId)?.candidate.source.toLowerCase();
  if (!source || state.stoppedSources.includes(source)) return false;
  if (task.mode === "canary") return state.canaryEnabled && now < new Date(state.canaryExpiresAt);
  return enabled && nzDate(now) === task.due && nzDate(now) <= state.manifest.end;
}
