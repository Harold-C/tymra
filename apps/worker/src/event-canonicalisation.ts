import { createHash } from "node:crypto";

import type { PublicEvent } from "@tymra/providers";

export type SourceEventIdentity = {
  externalId: string;
  sourceUrl: string;
};

export function sourceEventIdentity(event: PublicEvent): SourceEventIdentity {
  const metadata = jsonRecord(event.metadata);
  return {
    externalId: firstIdentity(metadata.sourceEventId, metadata.eventfindaEventId, metadata.seriesId) ?? event.externalId,
    sourceUrl: firstIdentity(metadata.seriesUrl) ?? event.sourceUrl,
  };
}

export function canonicalEventKey(event: PublicEvent) {
  return identityHash("event-series-v1", [event.title, event.venueName, event.city]);
}

export function canonicalEventOccurrenceKey(event: PublicEvent) {
  return identityHash("event-occurrence-v1", [
    event.title,
    event.venueName,
    event.city,
    event.startsAt.toISOString().slice(0, 16),
  ]);
}

export function canonicalVenueKey(event: PublicEvent) {
  const parts = [
    event.venueName,
    event.address,
    event.city,
    event.region,
    event.postcode,
    coordinate(event.latitude),
    coordinate(event.longitude),
  ];
  if (parts.every((value) => value === null || value === "")) return null;
  return identityHash("event-venue-v1", parts);
}

export function eventDescription(event: PublicEvent) {
  const description = jsonRecord(event.metadata).description;
  return typeof description === "string" && description.trim() ? description.trim() : null;
}

function identityHash(version: string, values: Array<string | null>) {
  const identity = [version, ...values.map(normaliseIdentityPart)].join("|");
  return createHash("sha256").update(identity).digest("hex");
}

function normaliseIdentityPart(value: string | null) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function coordinate(value: number | null) {
  return value === null ? null : value.toFixed(5);
}

function firstIdentity(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function jsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
