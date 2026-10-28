import { z } from "zod";
import { AdapterError, type PublicRawRecord } from "@tymra/providers/types";
import { parsePlatformJsonLdBlocks } from "@tymra/providers/public-event-platform-adapters";

export const eventbriteListingUrls = [
  "https://www.eventbrite.co.nz/d/new-zealand/events/",
  "https://www.eventbrite.co.nz/d/new-zealand--christchurch/events/",
] as const;

export const eventbriteExtractionSchema = z.object({
  data_schema: z.literal("eventbrite-public.collect_events"),
  schema_version: z.literal("1.0.0"),
  canonicalUrl: z.enum(eventbriteListingUrls),
  jsonLdPages: z.array(z.object({
    url: z.string().url(), blocks: z.array(z.string().min(1).max(256 * 1024)).min(1).max(32),
  }).strict()).min(1).max(3),
  pageCount: z.number().int().min(1).max(3),
  requestCount: z.number().int().min(1).max(3),
  truncated: z.boolean(),
}).strict().superRefine((value, context) => {
  if (value.pageCount !== value.jsonLdPages.length || value.requestCount < value.pageCount
    || value.requestCount > value.pageCount + 1) {
    context.addIssue({ code: "custom", message: "Eventbrite page/request counts do not match captured pages" });
  }
  for (const [index, page] of value.jsonLdPages.entries()) {
    const expected = index === 0 ? value.canonicalUrl : `${value.canonicalUrl}?page=${index + 1}`;
    if (page.url !== expected || page.blocks.reduce((sum, block) => sum + Buffer.byteLength(block), 0) > 256 * 1024) {
      context.addIssue({ code: "custom", path: ["jsonLdPages", index], message: "Eventbrite page left its bounded original route" });
    }
    for (const block of page.blocks) {
      try { JSON.parse(block); } catch {
        context.addIssue({ code: "custom", path: ["jsonLdPages", index], message: "Eventbrite JSON-LD is invalid" });
      }
    }
  }
});

export function eventbriteArgusRawRecords(
  extracted: z.infer<typeof eventbriteExtractionSchema>,
  reference: string,
  range: { from: Date; to: Date },
  maxRecords: number,
): PublicRawRecord[] {
  if (extracted.canonicalUrl !== reference) throw new AdapterError("PARSING_ERROR", "Eventbrite market changed", false);
  const events = new Map<string, ReturnType<typeof parsePlatformJsonLdBlocks>[number]>();
  for (const page of extracted.jsonLdPages) {
    const parsed = parsePlatformJsonLdBlocks(page.blocks, page.url, "eventbrite_events");
    if (!parsed.length) throw new AdapterError("PARSING_ERROR", "Eventbrite listing has no supported event JSON-LD", false);
    for (const event of parsed) {
      if (event.startsAt <= range.to && event.endsAt >= range.from) events.set(event.externalId, event);
    }
  }
  const selected = [...events.values()].slice(0, maxRecords);
  if (!selected.length) throw new AdapterError("PARSING_ERROR", "Eventbrite returned no events in the requested range", false);
  return selected.map((event, index) => ({
    sourceId: "eventbrite_events", externalId: event.externalId,
    payload: { kind: "event", event, listingUrl: extracted.canonicalUrl },
    fetchedAt: new Date(), fixture: false,
    networkRequestCount: index === 0 ? extracted.requestCount : 0,
  }));
}
