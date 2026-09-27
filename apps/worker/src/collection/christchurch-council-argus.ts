import { z } from "zod";
import { AdapterError, isCccAccessChallenge, parseChristchurchCouncilEventsPage, type PublicRawRecord } from "@tymra/providers";

const listingUrl = "https://www.ccc.govt.nz/news-and-events/whats-on";

export const christchurchCouncilExtractionSchema = z.object({
  data_schema: z.literal("christchurch-council-events.collect_events"),
  schema_version: z.literal("1.0.0"),
  canonicalUrl: z.literal(listingUrl),
  listingPages: z.array(z.object({ url: z.string().url(), html: z.string().min(1).max(500_000) }).strict()).min(1).max(3),
  pageCount: z.number().int().min(1).max(3),
  cardCount: z.number().int().positive(),
  truncated: z.boolean(),
}).strict();

export function councilArgusRawRecords(
  extracted: z.infer<typeof christchurchCouncilExtractionSchema>,
  range: { from: Date; to: Date },
  maxRecords: number,
): PublicRawRecord[] {
  if (extracted.pageCount !== extracted.listingPages.length) throw new AdapterError("PARSING_ERROR", "Council page count mismatch", false);
  const events = new Map<string, ReturnType<typeof parseChristchurchCouncilEventsPage>["events"][number]>();
  let count = 0;
  let expectedUrl: string | null = listingUrl;
  for (const page of extracted.listingPages) {
    if (page.url !== expectedUrl || isCccAccessChallenge(page.html)) {
      throw new AdapterError("PARSING_ERROR", "Council browser page chain or access state is invalid", false);
    }
    const parsed = parseChristchurchCouncilEventsPage(page.html, page.url);
    if (!parsed.events.length) throw new AdapterError("PARSING_ERROR", "Council browser page has no valid events", false);
    count += parsed.events.length;
    for (const event of parsed.events) {
      if (event.startsAt <= range.to && event.endsAt >= range.from) events.set(event.externalId, event);
    }
    expectedUrl = parsed.nextUrl;
  }
  if (count !== extracted.cardCount) throw new AdapterError("PARSING_ERROR", "Council card count mismatch", false);
  if (extracted.truncated !== (expectedUrl !== null)) throw new AdapterError("PARSING_ERROR", "Council pagination status mismatch", false);
  const selected = [...events.values()].slice(0, maxRecords);
  if (!selected.length) throw new AdapterError("PARSING_ERROR", "Council returned no events in the requested range", false);
  return selected.map((value, index) => ({
    sourceId: "christchurch_council_events",
    externalId: value.externalId,
    payload: { kind: "event", value },
    fetchedAt: new Date(),
    fixture: false,
    networkRequestCount: index === 0 ? extracted.pageCount : 0,
  }));
}
