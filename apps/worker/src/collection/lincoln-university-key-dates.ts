import { z } from "zod";

import type { PublicSignal } from "@tymra/providers";

export const LINCOLN_KEY_DATES_URL = "https://www.lincoln.ac.nz/study/key-dates/2026-academic-key-dates/";

const dateSchema = z.string().regex(/^20\d{2}-\d{2}-\d{2}$/u);
const categorySchema = z.enum([
  "SEMESTER_START", "SEMESTER_END", "ORIENTATION", "OPEN_DAY", "GRADUATION",
  "EXAMINATION_PERIOD", "BREAK", "FIELD_TRIP", "UNIVERSITY_CLOSURE",
  "INTERNATIONAL_INTAKE", "SUMMER_SCHOOL_START", "SUMMER_SCHOOL_END",
  "ADMINISTRATIVE", "OTHER",
]);

export const lincolnKeyDatesExtractionSchema = z.object({
  data_schema: z.literal("lincoln-university-key-dates.collect_key_dates"),
  schema_version: z.literal("1.0.0"),
  extractor: z.literal("lincoln_university_key_dates"),
  kind: z.literal("academic_key_dates"),
  institution: z.literal("Lincoln University"),
  academicYear: z.number().int().min(2000).max(2099),
  title: z.string().min(1),
  canonicalUrl: z.string().url(),
  connector: z.object({
    id: z.literal("lincoln-university-key-dates"),
    version: z.literal("1.0.0"),
    browserMode: z.literal("headed"),
  }),
  rawVisibleText: z.string(),
  keyDates: z.array(z.object({
    id: z.string().min(1),
    institution: z.literal("Lincoln University"),
    academicYear: z.number().int().min(2000).max(2099),
    title: z.string().min(1),
    advertisedDate: z.string().min(1),
    startsOn: dateSchema.nullable(),
    endsOn: dateSchema.nullable(),
    startsAt: z.string().regex(/^20\d{2}-\d{2}-\d{2}T00:00:00$/u).nullable(),
    endsAt: z.string().regex(/^20\d{2}-\d{2}-\d{2}T23:59:59$/u).nullable(),
    dateStatus: z.enum(["RESOLVED", "DATE_UNRESOLVED"]),
    category: categorySchema,
    demandRelevant: z.boolean(),
    sourceUrl: z.string().url(),
    timezone: z.literal("Pacific/Auckland"),
    rawVisibleText: z.string().min(1),
    fieldSources: z.record(z.string(), z.string()),
  })).min(1),
  quality: z.enum(["complete", "partial"]),
  missingFields: z.array(z.string()),
  warnings: z.array(z.string()),
  fieldSources: z.record(z.string(), z.string()),
}).superRefine((value, context) => {
  for (const [index, keyDate] of value.keyDates.entries()) {
    if (keyDate.academicYear !== value.academicYear) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["keyDates", index, "academicYear"], message: "academic year does not match the document" });
    }
    const resolved = keyDate.startsOn !== null && keyDate.endsOn !== null && keyDate.startsAt !== null && keyDate.endsAt !== null;
    if ((keyDate.dateStatus === "RESOLVED") !== resolved) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["keyDates", index, "dateStatus"], message: "date status does not match the date fields" });
    }
    if (keyDate.demandRelevant !== !["ADMINISTRATIVE", "OTHER"].includes(keyDate.category)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["keyDates", index, "demandRelevant"], message: "demand relevance does not match the category" });
    }
  }
});

export type LincolnKeyDatesExtraction = z.infer<typeof lincolnKeyDatesExtractionSchema>;

export function normaliseLincolnKeyDateSignals(
  extraction: LincolnKeyDatesExtraction,
  range: { from: Date; to: Date },
  maxRecords = extraction.keyDates.length,
): PublicSignal[] {
  return extraction.keyDates.flatMap((keyDate) => {
    if (!keyDate.demandRelevant || keyDate.dateStatus !== "RESOLVED" || !keyDate.startsOn || !keyDate.endsOn) return [];
    const startsAt = aucklandDate(keyDate.startsOn, 0, 0, 0);
    const endsAt = aucklandDate(keyDate.endsOn, 23, 59, 59);
    if (endsAt < range.from || startsAt > range.to) return [];
    return [{
      sourceId: "christchurch_university_dates",
      externalId: keyDate.id,
      marketKey: "christchurch",
      type: "UNIVERSITY_CALENDAR",
      title: keyDate.title,
      region: "Canterbury",
      startsAt,
      endsAt,
      direction: "POSITIVE",
      confidence: extraction.quality === "complete" ? 0.92 : 0.88,
      evidenceRef: keyDate.sourceUrl,
      metadata: {
        institution: keyDate.institution,
        academicYear: keyDate.academicYear,
        advertisedDate: keyDate.advertisedDate,
        category: keyDate.category,
        timezone: keyDate.timezone,
        rawVisibleText: keyDate.rawVisibleText,
        argusQuality: extraction.quality,
        argusMissingFields: extraction.missingFields,
        argusWarnings: extraction.warnings,
        argusFieldSources: keyDate.fieldSources,
        argusDocumentFieldSources: extraction.fieldSources,
      },
      fixture: false,
    } satisfies PublicSignal];
  }).slice(0, maxRecords);
}

function aucklandDate(value: string, hour: number, minute: number, second: number): Date {
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return new Date(guess.getTime() - timezoneOffset(guess));
}

function timezoneOffset(date: Date): number {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "Pacific/Auckland", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - date.getTime();
}
