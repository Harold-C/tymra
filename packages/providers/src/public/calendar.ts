import type { AdapterContext, AdapterHealth, AdapterMetadata, PublicDataAdapter, PublicDiscoveryRequest, PublicRawRecord, PublicSignal } from "../adapter-types";
import { nzStartOfDay } from "@tymra/domain";
import { AdapterError } from "../adapter-types";
import { marketKeysForAnniversaryRegion } from "../nz-market-coverage";
import { parseHTML } from "linkedom";
import { addUtcDays, isoDate, cleanText, slug, readBoundedText } from "./shared";

export type CalendarRecord = {
  id: string;
  title: string;
  region: string;
  startsAt: string;
  endsAt: string;
  type: "PUBLIC_HOLIDAY" | "ANNIVERSARY_DAY" | "SCHOOL_HOLIDAY";
};

export type CalendarParser = (html: string) => CalendarRecord[];

export class OfficialHtmlCalendarAdapter implements PublicDataAdapter {
  readonly metadata: AdapterMetadata;

  constructor(
    sourceId: string,
    sourceName: string,
    private readonly sourceUrl: string,
    private readonly parser: CalendarParser,
  ) {
    this.metadata = {
      sourceId,
      sourceName,
      sourceType: "PUBLIC_DATA",
      supportedDomains: [new URL(sourceUrl).hostname],
      adapterKey: `public:${sourceId}:calendar-v1`,
      accessMethod: "OFFICIAL_PUBLIC_HTML",
      concurrencyLimit: 1,
      dailyBudget: 10,
      collectorVersion: "official-html-fetch-v1",
      parserVersion: "official-calendar-html-v1",
    };
  }

  async discover(_request: PublicDiscoveryRequest, _context: AdapterContext): Promise<string[]> {
    return [this.sourceUrl];
  }

  async fetch(reference: string, context: AdapterContext): Promise<PublicRawRecord[]> {
    const response = await fetch(reference, { headers: { accept: "text/html", "user-agent": "TymraLocalAcceptance/1.0" }, signal: context.signal });
    if (!response.ok) throw new AdapterError("SOURCE_UNAVAILABLE", `${this.metadata.sourceName} returned HTTP ${response.status}`, response.status >= 500 || response.status === 429);
    const html = await readBoundedText(response, context.collectionLimits?.maxBytes ?? 5_000_000);
    let records: CalendarRecord[];
    try { records = this.parser(html); }
    catch (error) { throw new AdapterError("PARSING_ERROR", error instanceof Error ? error.message : `${this.metadata.sourceName} calendar parsing failed`, false); }
    const from = context.collectionRange?.from.getTime() ?? Number.NEGATIVE_INFINITY;
    const to = context.collectionRange?.to.getTime() ?? Number.POSITIVE_INFINITY;
    const matching = records.filter((record) => nzStartOfDay(record.endsAt).getTime() >= from && nzStartOfDay(record.startsAt).getTime() <= to);
    if (matching.length > (context.collectionLimits?.maxRecords ?? matching.length)) {
      throw new AdapterError("PARSING_ERROR", `${this.metadata.sourceName} calendar exceeds the approved record budget`, false);
    }
    return matching.map((record) => ({ sourceId: this.metadata.sourceId, externalId: record.id, payload: record, fetchedAt: new Date(), fixture: false }));
  }

  async normalise(records: PublicRawRecord[], _context: AdapterContext): Promise<PublicSignal[]> {
    return records.flatMap((record) => {
      const value = record.payload as CalendarRecord;
      const marketKeys = value.type === "ANNIVERSARY_DAY" ? marketKeysForAnniversaryRegion(value.region) : ["new-zealand"];
      return marketKeys.map((marketKey, index): PublicSignal => ({
        sourceId: this.metadata.sourceId,
        externalId: index === 0 ? value.id : `${value.id}:market:${marketKey}`,
        marketKey,
        type: value.type,
        title: value.title,
        region: value.region,
        startsAt: nzStartOfDay(value.startsAt),
        endsAt: nzStartOfDay(value.endsAt),
        direction: "POSITIVE",
        confidence: 1,
        evidenceRef: `${this.sourceUrl}#${value.id}`,
        fixture: false,
      }));
    });
  }

  async healthCheck(context: AdapterContext): Promise<AdapterHealth> {
    const started = Date.now();
    try {
      const response = await fetch(this.sourceUrl, { method: "HEAD", signal: context.signal ?? AbortSignal.timeout(10_000) });
      return { status: response.ok ? "HEALTHY" : "DEGRADED", checkedAt: new Date(), message: `Official calendar returned HTTP ${response.status}`, latencyMs: Date.now() - started, mode: context.mode };
    } catch (error) {
      return { status: "DOWN", checkedAt: new Date(), message: error instanceof Error ? error.message : "Official calendar health check failed", latencyMs: Date.now() - started, mode: context.mode };
    }
  }

}

export function parseEmploymentPublicHolidays(html: string): CalendarRecord[] {
  const { document } = parseHTML(html);
  const headings = [...document.querySelectorAll("h2")].filter((element) => /\b\d{4}\s+public holiday and anniversary dates/i.test(element.textContent));
  if (!headings.length) throw new Error("Employment NZ page has no public-holiday heading");
  return headings.flatMap((heading) => {
    const year = Number(heading.textContent.match(/\b(20\d{2})\b/)?.[1]);
    if (!Number.isInteger(year)) throw new Error("Employment NZ public-holiday heading has no year");
    const tables: Element[] = [];
    for (let element = heading.nextElementSibling; element && tables.length < 2; element = element.nextElementSibling) {
      if (element.tagName === "H2") break;
      if (element.tagName === "TABLE") tables.push(element);
    }
    if (tables.length < 2) throw new Error("Employment NZ page has no public-holiday and anniversary tables");
    return [
      ...calendarTableRows(tables[0]!).map(([title, , observed]) => calendarRecord(year, title, "New Zealand", observed, "PUBLIC_HOLIDAY")),
      ...calendarTableRows(tables[1]!).map(([region, , observed]) => calendarRecord(year, `${region} Anniversary Day`, region, observed, "ANNIVERSARY_DAY")),
    ].filter((record): record is CalendarRecord => record !== null);
  });
}

export function parseEducationSchoolHolidays(html: string): CalendarRecord[] {
  const { document } = parseHTML(html);
  const headings = [...document.querySelectorAll("h2")].filter((element) => /\b20\d{2}\s+school holidays/i.test(element.textContent));
  if (!headings.length) throw new Error("Ministry of Education page has no school-holiday heading");
  const records: CalendarRecord[] = [];
  for (const heading of headings) {
    const year = Number(heading.textContent.match(/\b(20\d{2})\b/)?.[1]);
    if (!Number.isInteger(year)) continue;
    for (let element = heading.nextElementSibling; element; element = element.nextElementSibling) {
      if (element.tagName === "H2") break;
      if (element.tagName !== "H3") continue;
      const label = cleanText(element.textContent.replace("#", ""));
      const description = cleanText(element.nextElementSibling?.tagName === "P" ? element.nextElementSibling.textContent : "");
      const range = parseDateRange(description, year);
      if (!range) continue;
      records.push({ id: `school-holiday:${year}:${slug(label)}`, title: `New Zealand school holiday after ${label}`, region: "New Zealand", startsAt: isoDate(range.start), endsAt: isoDate(addUtcDays(range.end, 1)), type: "SCHOOL_HOLIDAY" });
    }
  }
  if (!records.length) throw new Error("Ministry of Education page has no exact school-holiday ranges");
  return records;
}

export function calendarTableRows(table: Element): string[][] {
  return [...table.querySelectorAll("tr")].slice(1).map((row) => [...row.querySelectorAll("th,td")].map((cell) => cleanText(cell.textContent))).filter((row) => row.length >= 3 && row[0] && row[2]);
}

export function calendarRecord(year: number, title: string, region: string, observed: string, type: CalendarRecord["type"]): CalendarRecord | null {
  const start = parseObservedDate(observed, year);
  if (!start) return null;
  return {
    id: `${type.toLowerCase()}:${year}:${slug(`${region}:${title}`)}`,
    title,
    region,
    startsAt: isoDate(start),
    endsAt: isoDate(addUtcDays(start, 1)),
    type,
  };
}

export function parseDateRange(value: string, year: number): { start: Date; end: Date } | null {
  const match = value.match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)\s+to\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)(?:\s+(20\d{2}))?/i);
  if (!match) return null;
  const effectiveYear = Number(match[5] ?? year);
  const start = dateFromParts(effectiveYear, match[2]!, Number(match[1]));
  const end = dateFromParts(effectiveYear, match[4]!, Number(match[3]));
  return start && end ? { start, end } : null;
}

export function parseObservedDate(value: string, year: number): Date | null {
  const match = cleanText(value).match(/(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2})\s+([A-Za-z]+)/i);
  return match ? dateFromParts(year, match[2]!, Number(match[1])) : null;
}

export function dateFromParts(year: number, monthName: string, day: number): Date | null {
  const month = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].indexOf(monthName.toLowerCase());
  if (month < 0 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day ? date : null;
}
