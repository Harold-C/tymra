import { z } from "zod";

import type { PublicRawRecord } from "@tymra/providers";

const fieldSourcesSchema = z.record(z.string(), z.string());
const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);

export const aucklandAirportMonthlyExtractionSchema = z.object({
  data_schema: z.literal("auckland-airport-monthly.collect_monthly_traffic"),
  schema_version: z.literal("1.0.0"),
  sourceUrl: z.string().url(),
  records: z.array(z.object({
    period: periodSchema,
    domesticPassengers: z.number().int().nonnegative().nullable(),
    internationalPassengers: z.number().int().nonnegative().nullable(),
    totalPassengers: z.number().int().nonnegative(),
    annualChangePercent: z.number().finite().nullable(),
    fieldSources: fieldSourcesSchema,
  }).strict()),
  totalRecords: z.number().int().nonnegative(),
  truncated: z.boolean(),
  quality: z.enum(["complete", "partial"]),
  warnings: z.array(z.string()),
  fieldSources: fieldSourcesSchema,
}).strict().superRefine((value, context) => {
  if (value.totalRecords !== value.records.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalRecords"], message: "totalRecords must equal records.length" });
  for (const [index, record] of value.records.entries()) {
    if (record.domesticPassengers !== null && record.internationalPassengers !== null && Math.abs(record.domesticPassengers + record.internationalPassengers - record.totalPassengers) > 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["records", index, "totalPassengers"], message: "passenger components do not equal totalPassengers" });
    }
  }
});

export const motAirlinePerformanceExtractionSchema = z.object({
  data_schema: z.literal("mot-airline-performance.collect_monthly_performance"),
  schema_version: z.literal("1.0.0"),
  sourceUrl: z.string().url(),
  reportingBasis: z.literal("VOLUNTARY_PARTICIPATING_AIRLINES"),
  coverageCaveat: z.string().min(1),
  records: z.array(z.object({
    period: periodSchema,
    originAirportCode: z.string().regex(/^[A-Z]{3}$/u),
    destinationAirportCode: z.string().regex(/^[A-Z]{3}$/u),
    originName: z.string().min(1).nullable(),
    destinationName: z.string().min(1).nullable(),
    scheduledFlights: z.number().int().nonnegative().nullable(),
    arrivalOnTimePercent: z.number().min(0).max(100).nullable(),
    departureOnTimePercent: z.number().min(0).max(100).nullable(),
    cancelledFlights: z.number().int().nonnegative().nullable(),
    cancellationPercent: z.number().min(0).max(100).nullable(),
    fieldSources: fieldSourcesSchema,
  }).strict()),
  totalRecords: z.number().int().nonnegative(),
  truncated: z.boolean(),
  quality: z.enum(["complete", "partial"]),
  warnings: z.array(z.string()),
  fieldSources: fieldSourcesSchema,
}).strict().superRefine((value, context) => {
  if (value.totalRecords !== value.records.length) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalRecords"], message: "totalRecords must equal records.length" });
});

export type AucklandAirportMonthlyExtraction = z.infer<typeof aucklandAirportMonthlyExtractionSchema>;
export type MotAirlinePerformanceExtraction = z.infer<typeof motAirlinePerformanceExtractionSchema>;

export function aucklandAirportExtractionRecords(extraction: AucklandAirportMonthlyExtraction): PublicRawRecord[] {
  return extraction.records.map((record, index) => ({
    sourceId: "auckland_airport_monthly",
    externalId: `airport-passengers:${record.period}`,
    payload: { record: withoutFieldSources(record), sourceUrl: extraction.sourceUrl, extractionQuality: extraction.quality, warnings: extraction.warnings, fieldSources: record.fieldSources },
    fetchedAt: new Date(),
    fixture: false,
    networkRequestCount: index === 0 ? 1 : 0,
  }));
}

export function motAirlinePerformanceExtractionRecords(extraction: MotAirlinePerformanceExtraction): PublicRawRecord[] {
  return extraction.records.map((record, index) => ({
    sourceId: "mot_airline_performance",
    externalId: `airline-performance:${record.period}:${record.originAirportCode}:${record.destinationAirportCode}`,
    payload: {
      record: { ...withoutFieldSources(record), coverageCaveat: extraction.coverageCaveat },
      sourceUrl: extraction.sourceUrl,
      reportingBasis: extraction.reportingBasis,
      extractionQuality: extraction.quality,
      warnings: extraction.warnings,
      fieldSources: record.fieldSources,
    },
    fetchedAt: new Date(),
    fixture: false,
    networkRequestCount: index === 0 ? 1 : 0,
  }));
}

function withoutFieldSources<T extends { fieldSources: Record<string, string> }>(value: T): Omit<T, "fieldSources"> {
  const { fieldSources: _fieldSources, ...record } = value;
  return record;
}
