import {
  emptyEventImpactEvidence,
  eventImpactEvidenceBundleSchema,
  type EventImpactEvidenceBundle,
} from "@tymra/domain";
import type { PublicEvent } from "@tymra/providers";

export type TrustedVenueReference = {
  key: string;
  aliases: string[];
  name: string;
  address: string;
  city: string;
  region: string;
  territorialAuthority: string;
  postcode: string;
  countryCode: "NZ";
  capacity: number;
  capacitySourceUrl: string;
  capacityObservedAt: string;
};

const trustedVenues: TrustedVenueReference[] = [{
  key: "te-pae-christchurch",
  aliases: ["te pae", "te pae christchurch", "te pae christchurch convention centre"],
  name: "Te Pae Christchurch Convention Centre",
  address: "188 Oxford Terrace, Christchurch 8011",
  city: "Christchurch",
  region: "Canterbury",
  territorialAuthority: "Christchurch City",
  postcode: "8011",
  countryCode: "NZ",
  capacity: 3_600,
  capacitySourceUrl: "https://www.tepae.co.nz/spaces/exhibition-hall",
  capacityObservedAt: "2026-08-05T00:00:00.000Z",
}];

export function enrichEventVenue(event: PublicEvent) {
  const reference = findTrustedVenue(event.venueName);
  if (!reference || event.countryCode.toUpperCase() !== reference.countryCode) return { event, reference: null };
  const parsedEvidence = eventImpactEvidenceBundleSchema.safeParse(event.impactEvidence);
  const evidence: EventImpactEvidenceBundle = parsedEvidence.success ? parsedEvidence.data : emptyEventImpactEvidence();
  const capacityItem = {
    evidenceType: "VENUE_CAPACITY" as const,
    value: reference.capacity,
    unit: "people",
    sourceUrl: reference.capacitySourceUrl,
    observedAt: reference.capacityObservedAt,
    confidence: 0.98,
    notes: "Maximum published venue configuration; capacity alone does not prove attendance",
  };
  const hasCapacity = evidence.items.some((item) => item.evidenceType === "VENUE_CAPACITY" && item.sourceUrl === capacityItem.sourceUrl);
  return {
    event: {
      ...event,
      venueName: event.venueName ?? reference.name,
      address: event.address ?? reference.address,
      city: event.city ?? reference.city,
      region: event.region ?? reference.region,
      territorialAuthority: event.territorialAuthority ?? reference.territorialAuthority,
      postcode: event.postcode ?? reference.postcode,
      impactEvidence: { ...evidence, items: hasCapacity ? evidence.items : [...evidence.items, capacityItem] },
      metadata: { ...event.metadata, venueReferenceKey: reference.key, venueReferenceVersion: "trusted-venue-v1" },
    },
    reference,
  };
}

function findTrustedVenue(name: string | null) {
  if (!name) return null;
  const normalized = normalize(name);
  return trustedVenues.find((venue) => venue.aliases.some((alias) => normalize(alias) === normalized)) ?? null;
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
