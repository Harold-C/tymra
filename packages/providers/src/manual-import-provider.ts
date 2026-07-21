import { parse } from "csv-parse/sync";
import { z } from "zod";

import type {
  DataProvider,
  PropertyCandidate,
  ProviderContext,
  ProviderHealth,
  ProviderRate,
  ProviderRightsMetadata,
  RateRequest,
  UnitCandidate,
} from "./index";

export const manualImportRowSchema = z.object({
  property_external_id: z.string().trim().min(1),
  property_name: z.string().trim().min(1),
  property_address: z.string().trim().min(3),
  unit_external_id: z.string().trim().min(1),
  unit_name: z.string().trim().min(1),
  listing_external_id: z.string().trim().min(1),
  check_in: z.coerce.date(),
  check_out: z.coerce.date(),
  currency: z.literal("NZD"),
  base_amount_minor: z.coerce.number().int().nonnegative(),
  mandatory_fees_minor: z.coerce.number().int().nonnegative(),
  taxes_minor: z.coerce.number().int().nonnegative(),
  platform_fees_minor: z.coerce.number().int().nonnegative(),
  cancellation_category: z.string().trim().min(1),
  minimum_stay: z.preprocess(
    (value) => (value === "" || value === null || value === undefined ? null : value),
    z.coerce.number().int().positive().nullable(),
  ),
  availability_status: z.enum([
    "AVAILABLE",
    "SOLD_OUT",
    "CLOSED_TO_ARRIVAL",
    "MINIMUM_STAY_RESTRICTION",
    "LISTING_UNAVAILABLE",
    "DATA_UNAVAILABLE",
    "PLATFORM_ERROR",
  ]),
  fee_completeness: z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]),
  collected_at: z.coerce.date(),
}).superRefine((row, context) => {
  if (row.check_out <= row.check_in) {
    context.addIssue({
      code: "custom",
      path: ["check_out"],
      message: "check_out must be after check_in",
    });
  }
});

export type ManualImportRow = z.infer<typeof manualImportRowSchema>;

export type ManualImportError = {
  row: number;
  fields: Record<string, string[]>;
};

export type ManualImportPreview = {
  rows: ManualImportRow[];
  errors: ManualImportError[];
  totalRows: number;
};

export const manualImportCsvHeaders = [
  "property_external_id",
  "property_name",
  "property_address",
  "unit_external_id",
  "unit_name",
  "listing_external_id",
  "check_in",
  "check_out",
  "currency",
  "base_amount_minor",
  "mandatory_fees_minor",
  "taxes_minor",
  "platform_fees_minor",
  "cancellation_category",
  "minimum_stay",
  "availability_status",
  "fee_completeness",
  "collected_at",
] as const;

export function previewManualImport(content: string, format: "csv" | "json"): ManualImportPreview {
  const rawRows: unknown[] =
    format === "json"
      ? parseJsonRows(content)
      : parse(content, {
          columns: true,
          bom: true,
          skip_empty_lines: true,
          trim: true,
        });

  const rows: ManualImportRow[] = [];
  const errors: ManualImportError[] = [];

  rawRows.forEach((rawRow, index) => {
    const result = manualImportRowSchema.safeParse(rawRow);
    if (result.success) {
      rows.push(result.data);
      return;
    }

    errors.push({
      row: index + 2,
      fields: result.error.flatten().fieldErrors as Record<string, string[]>,
    });
  });

  return { rows, errors, totalRows: rawRows.length };
}

function parseJsonRows(content: string): unknown[] {
  const value: unknown = JSON.parse(content);
  if (!Array.isArray(value)) throw new Error("Manual import JSON must contain an array of rows");
  return value;
}

export class ManualImportProvider implements DataProvider {
  readonly key = "manual";

  constructor(
    private readonly rows: readonly ManualImportRow[],
    private readonly rights: ProviderRightsMetadata,
  ) {}

  async identifyProperty(input: string, _context: ProviderContext): Promise<PropertyCandidate[]> {
    const normalized = input.trim().toLowerCase();
    const unique = new Map<string, ManualImportRow>();
    for (const row of this.rows) {
      if (`${row.property_name} ${row.property_address}`.toLowerCase().includes(normalized)) {
        unique.set(row.property_external_id, row);
      }
    }

    const matchStatus = unique.size === 1 ? "UNIQUE" : unique.size > 1 ? "MULTIPLE" : "NONE";
    return [...unique.values()].map((row) => ({
      externalId: row.property_external_id,
      canonicalName: row.property_name,
      address: row.property_address,
      city: "Christchurch",
      countryCode: "NZ",
      accommodationType: "MANUAL_IMPORT",
      matchStatus,
      isDemo: false,
    }));
  }

  async listUnits(propertyExternalId: string, _context: ProviderContext): Promise<UnitCandidate[]> {
    const unique = new Map<string, ManualImportRow>();
    for (const row of this.rows) {
      if (row.property_external_id === propertyExternalId) unique.set(row.unit_external_id, row);
    }
    return [...unique.values()].map((row) => ({
      externalId: row.unit_external_id,
      officialName: row.unit_name,
      capacity: 2,
      bedrooms: null,
      bedTypes: [],
      amenities: [],
      isDemo: false,
    }));
  }

  async fetchRates(request: RateRequest, _context: ProviderContext): Promise<ProviderRate[]> {
    return this.rows
      .filter(
        (row) =>
          row.property_external_id === request.propertyExternalId &&
          row.unit_external_id === request.unitExternalId &&
          row.check_in.getTime() === request.checkIn.getTime() &&
          row.check_out.getTime() === request.checkOut.getTime(),
      )
      .map((row) => ({
        listingExternalId: row.listing_external_id,
        currency: row.currency,
        baseAmountMinor: row.base_amount_minor,
        mandatoryFeesMinor: row.mandatory_fees_minor,
        taxesMinor: row.taxes_minor,
        platformFeesMinor: row.platform_fees_minor,
        cancellationCategory: row.cancellation_category,
        minimumStay: row.minimum_stay,
        availabilityStatus: row.availability_status,
        feeCompleteness: row.fee_completeness,
        collectedAt: row.collected_at,
        isDemo: false,
      }));
  }

  async healthCheck(_context: ProviderContext): Promise<ProviderHealth> {
    return {
      status: this.rows.length > 0 ? "HEALTHY" : "DEGRADED",
      checkedAt: new Date(),
      message: this.rows.length > 0 ? "Validated manual import is available" : "No validated manual import is available",
    };
  }

  async rightsMetadata(_context: ProviderContext): Promise<ProviderRightsMetadata> {
    return { ...this.rights };
  }
}
