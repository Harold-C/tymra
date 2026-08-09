import { funnelEventSchema, nzDateStorageValue, type FunnelEvent } from "@tymra/domain";

import { prisma } from "./index";

export async function recordFunnelEvent(input: FunnelEvent) {
  const event = funnelEventSchema.parse(input);
  const occurredAt = event.occurredAt ?? new Date();
  const bucketDate = nzDateStorageValue(occurredAt);
  const dimensions = orderedDimensions(event.dimensions);
  const dimensionKey = JSON.stringify(dimensions);

  return prisma.funnelMetricDaily.upsert({
    where: { bucketDate_eventName_dimensionKey: { bucketDate, eventName: event.name, dimensionKey } },
    create: { bucketDate, eventName: event.name, dimensionKey, dimensions, count: 1 },
    update: { count: { increment: 1 } },
  });
}

function orderedDimensions(dimensions: FunnelEvent["dimensions"]) {
  return Object.fromEntries(Object.entries(dimensions).sort(([left], [right]) => left.localeCompare(right)));
}
