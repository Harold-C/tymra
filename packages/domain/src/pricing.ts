import { z } from "zod";

export const priceComponentsSchema = z.object({
  baseAmountMinor: z.number().int().nonnegative(),
  mandatoryFeesMinor: z.number().int().nonnegative(),
  taxesMinor: z.number().int().nonnegative(),
  platformFeesMinor: z.number().int().nonnegative(),
  nights: z.number().int().positive(),
});

export type PriceComponents = z.infer<typeof priceComponentsSchema>;

export function calculateEffectiveNightlyTotalMinor(input: PriceComponents): number {
  const value = priceComponentsSchema.parse(input);
  const total = value.baseAmountMinor + value.mandatoryFeesMinor + value.taxesMinor + value.platformFeesMinor;
  return Math.round(total / value.nights);
}

