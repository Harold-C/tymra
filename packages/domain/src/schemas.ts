import { z } from "zod";

import { feedbackTypeSchema, localeSchema } from "./enums";
import { NEW_ZEALAND_TIME_ZONE } from "./nz-time";

export const stayQuerySchema = z
  .object({
    checkIn: z.coerce.date(),
    checkOut: z.coerce.date(),
    adults: z.number().int().min(1).max(16).default(2),
    children: z.number().int().min(0).max(16).default(0),
    units: z.number().int().min(1).max(10).default(1),
    currency: z.literal("NZD").default("NZD"),
    cancellationCategory: z.string().min(1).max(80).default("STANDARD"),
    timezone: z.literal(NEW_ZEALAND_TIME_ZONE),
  })
  .superRefine((value, context) => {
    if (value.checkOut <= value.checkIn) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["checkOut"],
        message: "Check-out must be after check-in",
      });
    }
  });

export type StayQueryInput = z.infer<typeof stayQuerySchema>;

export const propertySearchSchema = z.object({
  input: z.string().trim().min(3).max(500),
  locale: localeSchema,
});

export const createAnonymousCheckSchema = z.object({
  input: z.string().trim().url().max(1_000),
  locale: localeSchema,
  idempotencyKey: z.string().min(16).max(200),
  challengeToken: z.string().min(32).max(1_000).optional(),
});

export const unlockRoughResultSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  serviceConsent: z.literal(true),
  marketingConsent: z.boolean().default(false),
  idempotencyKey: z.string().min(16).max(200),
});

export const createPriceCheckSchema = z.object({
  analysisType: z.enum(["LISTING_PRICING", "LOCATION_BENCHMARK"]).default("LISTING_PRICING"),
  email: z.string().trim().toLowerCase().email(),
  locale: localeSchema,
  input: z.string().trim().min(3).max(500),
  propertyId: z.string().min(1).optional(),
  unitId: z.string().min(1).optional(),
  stayQuery: stayQuerySchema,
  serviceConsent: z.literal(true),
  marketingConsent: z.boolean().default(false),
  idempotencyKey: z.string().min(16).max(200),
});

export const feedbackSchema = z.object({
  feedbackType: feedbackTypeSchema,
  insightId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  comment: z.string().trim().max(2_000).optional(),
  idempotencyKey: z.string().min(16).max(200),
});
