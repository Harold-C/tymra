export type SourceAccessState = {
  providerType?: string;
  enabled: boolean;
  operationalStatus: string;
};

export function automaticSchedulingAllowed(nodeEnv: string, schedulerEnabled: boolean) {
  return nodeEnv !== "development" && schedulerEnabled;
}

export function sourceCollectionBlockers(
  source: SourceAccessState,
  _nodeEnv: string,
  _options: { allowDegradedInProduction?: boolean } = {},
): string[] {
  const blockers = [...(!source.enabled ? ["source is not enabled"] : [])];
  if (source.operationalStatus !== "HEALTHY") blockers.push("source is not operationally available");
  return blockers;
}

export function sourceSchedulingBlockers(
  source: SourceAccessState,
  adapterRegistered = true,
  nodeEnv = "production",
): string[] {
  return [
    ...(source.providerType !== "PUBLIC" ? ["source is not a public-data source"] : []),
    ...(!adapterRegistered ? ["no public adapter is registered"] : []),
    ...sourceCollectionBlockers(source, nodeEnv),
  ];
}
