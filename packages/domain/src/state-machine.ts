import type { PriceCheckStatus } from "./enums";

const automaticStates: PriceCheckStatus[] = [
  "VALIDATING",
  "QUEUED",
  "COLLECTING",
  "NORMALIZING",
  "ANALYSING",
  "AUTO_VALIDATING",
];

const transitions: Record<PriceCheckStatus, readonly PriceCheckStatus[]> = {
  DRAFT: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["NEEDS_CONFIRMATION", "QUEUED", "EXCEPTION", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED"],
  NEEDS_CONFIRMATION: ["VALIDATING", "QUEUED", "CANCELLED", "EXPIRED"],
  QUEUED: ["COLLECTING", "EXCEPTION", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED"],
  COLLECTING: ["NORMALIZING", "EXCEPTION", "PARTIAL", "INSUFFICIENT_DATA", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED"],
  NORMALIZING: ["ANALYSING", "EXCEPTION", "PARTIAL", "INSUFFICIENT_DATA", "FAILED", "CANCELLED"],
  ANALYSING: ["AUTO_VALIDATING", "EXCEPTION", "PARTIAL", "INSUFFICIENT_DATA", "FAILED", "CANCELLED"],
  AUTO_VALIDATING: ["READY", "EXCEPTION", "PARTIAL", "INSUFFICIENT_DATA", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED"],
  EXCEPTION: ["VALIDATING", "QUEUED", "COLLECTING", "NORMALIZING", "ANALYSING", "AUTO_VALIDATING", "READY", "PARTIAL", "INSUFFICIENT_DATA", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED"],
  READY: ["PUBLISHED", "EXCEPTION", "FAILED", "CANCELLED"],
  PUBLISHED: ["EXPIRED", "WITHDRAWN", "ARCHIVED"],
  PARTIAL: ["PUBLISHED", "WITHDRAWN", "ARCHIVED"],
  INSUFFICIENT_DATA: ["ARCHIVED"],
  UNSUPPORTED: ["ARCHIVED"],
  SOURCE_UNAVAILABLE: ["QUEUED", "COLLECTING", "ARCHIVED", "CANCELLED"],
  FAILED: ["QUEUED", "ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  EXPIRED: ["ARCHIVED"],
  WITHDRAWN: ["ARCHIVED"],
  ARCHIVED: [],
};

export function canTransitionPriceCheck(from: PriceCheckStatus, to: PriceCheckStatus): boolean {
  return transitions[from].includes(to);
}

export function assertPriceCheckTransition(from: PriceCheckStatus, to: PriceCheckStatus): void {
  if (!canTransitionPriceCheck(from, to)) {
    throw new InvalidPriceCheckTransitionError(from, to);
  }
}

export function isAutomaticProcessingStatus(status: PriceCheckStatus): boolean {
  return automaticStates.includes(status);
}

export class InvalidPriceCheckTransitionError extends Error {
  constructor(
    readonly from: PriceCheckStatus,
    readonly to: PriceCheckStatus,
  ) {
    super(`Invalid Price Check transition: ${from} -> ${to}`);
    this.name = "InvalidPriceCheckTransitionError";
  }
}

