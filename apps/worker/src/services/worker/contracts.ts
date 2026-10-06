import { Prisma } from "@tymra/db";

export type CreateWorkerRequest = {
  input: string;
  locale?: "en" | "zh";
  idempotencyKey: string;
  email?: string;
  serviceConsent?: boolean;
  marketingConsent?: boolean;
  deviceId?: string;
  ipAddress?: string;
};

export type ConfirmWorkerRequest = {
  sellableUnitId: string;
};

export type CollectSourceOptions = {
  jobId?: string;
  lincolnOnly?: boolean;
  rollingLincoln?: boolean;
  productionCanary?: boolean;
  boundedPublicSchedule?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
  dryRun?: boolean;
  phase?: "discovery" | "details" | "full";
  maxPages?: number;
  maxDetails?: number;
  localAcceptance?: boolean;
  developmentBootstrap?: boolean;
};

export type ConfigureSourceSchedulesRequest = {
  enabled: boolean;
  reason: string;
};

export type EventPersistenceCache = {
  series: Map<string, { sourceEventId: string; canonicalEventId: string }>;
  venues: Map<string, string>;
};

export type DirectEventPageLoader = (input: { source: "eventfinda" | "ticketmaster"; url: string }) => Promise<{ html: string; finalUrl?: string }>;

export type SnapshotMarketSignal = {
  id: string;
  dataSourceId?: string | null;
  type: string;
  region: string;
  startsAt?: Date;
  endsAt?: Date;
  evidence: Prisma.JsonValue;
};

export type PublicSignalCollectionRunEvidence = {
  sourceId: string;
  status: string;
  errorCode?: string | null;
};
