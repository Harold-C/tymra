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
  nodeEnv: string,
  options: { allowDegradedInProduction?: boolean; allowDevelopmentValidation?: boolean } = {},
): string[] {
  const blockers = [...(!source.enabled ? ["source is not enabled"] : [])];
  const developmentValidation = nodeEnv === "development" && options.allowDevelopmentValidation === true;
  const developmentStatusAllowed = developmentValidation && source.operationalStatus !== "BLOCKED";
  const boundedProductionTrial = nodeEnv === "production" && options.allowDegradedInProduction === true && source.operationalStatus === "DEGRADED";
  if (source.operationalStatus !== "HEALTHY" && !developmentStatusAllowed && !boundedProductionTrial) blockers.push("source is not operationally available");
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
    ...sourceCollectionBlockers(source, nodeEnv, { allowDevelopmentValidation: false }),
  ];
}
