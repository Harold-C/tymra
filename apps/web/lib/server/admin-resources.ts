import { prisma, type Prisma } from "@tymra/db";

export type AdminResource = "properties" | "units" | "listings" | "competitors" | "marketCoverage" | "collectionRuns" | "dataSources" | "events" | "signals" | "feedback" | "audit" | "settings";
export type AdminResourcePageQuery = { q: string; kind: string; skip: number; take: number; since?: Date };

export const adminResourceQueries = {
  properties: async () => await prisma.property.findMany({ orderBy: { canonicalName: "asc" }, take: 100, include: { _count: { select: { units: true, priceChecks: true } } } }),
  units: async () => await prisma.sellableUnit.findMany({ orderBy: { officialName: "asc" }, take: 100, include: { property: { select: { canonicalName: true } }, _count: { select: { listings: true, priceChecks: true } } } }),
  listings: async () => await prisma.listing.findMany({ orderBy: { firstDiscoveredAt: "desc" }, take: 100, include: { unit: { select: { officialName: true } }, dataSource: { select: { name: true } } } }),
  competitors: async () => await prisma.competitorRelationship.findMany({ orderBy: [{ targetUnitId: "asc" }, { version: "desc" }], take: 100, include: { targetUnit: { select: { officialName: true, propertyId: true } }, competitorUnit: { select: { officialName: true } } } }),
  marketCoverage: async () => await prisma.marketCoverage.findMany({ orderBy: [{ gapPriorityScore: "desc" }, { name: "asc" }] }),
  collectionRuns: async () => await prisma.collectionRun.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { dataSource: { select: { name: true } } } }),
  dataSources: async () => await prisma.dataSource.findMany({ orderBy: { name: "asc" } }),
  events: async () => await prisma.eventOccurrence.findMany({ orderBy: { startsAt: "desc" }, take: 150, include: { canonicalEvent: true, venue: true, sourceLinks: { include: { sourceEventOccurrence: { include: { dataSource: { select: { name: true } } } } } } } }),
  signals: async () => await prisma.marketSignal.findMany({ orderBy: { startsAt: "desc" }, take: 100 }),
  feedback: async () => await prisma.feedback.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
  audit: async () => await prisma.auditEvent.findMany({ orderBy: { createdAt: "desc" }, take: 150 }),
};

export const adminPaginatedQueries = {
  listings: async (page: AdminResourcePageQuery) => {
    const where: Prisma.ListingWhereInput = { isDemo: false, ...(page.q ? { OR: [{ externalId: { contains: page.q, mode: "insensitive" } }, { unit: { officialName: { contains: page.q, mode: "insensitive" } } }, { dataSource: { name: { contains: page.q, mode: "insensitive" } } }] } : {}) };
    const [total, items] = await Promise.all([prisma.listing.count({ where }), prisma.listing.findMany({ where, orderBy: { firstDiscoveredAt: "desc" }, skip: page.skip, take: page.take, include: { unit: { select: { officialName: true } }, dataSource: { select: { name: true } } } })]);
    return { total, items };
  },
  competitors: async (page: AdminResourcePageQuery) => {
    const where: Prisma.CompetitorRelationshipWhereInput = { isDemo: false, ...(page.q ? { OR: [{ targetUnit: { officialName: { contains: page.q, mode: "insensitive" } } }, { competitorUnit: { officialName: { contains: page.q, mode: "insensitive" } } }] } : {}) };
    const [total, items] = await Promise.all([prisma.competitorRelationship.count({ where }), prisma.competitorRelationship.findMany({ where, orderBy: [{ targetUnitId: "asc" }, { version: "desc" }], skip: page.skip, take: page.take, include: { targetUnit: { select: { officialName: true, propertyId: true } }, competitorUnit: { select: { officialName: true } } } })]);
    return { total, items };
  },
  feedback: async (page: AdminResourcePageQuery) => {
    const where: Prisma.FeedbackWhereInput = { isDemo: false, ...(page.kind ? { type: page.kind as never } : {}), ...(page.since ? { createdAt: { gte: page.since } } : {}), ...(page.q ? { OR: [{ id: { contains: page.q, mode: "insensitive" } }, { priceCheckId: { contains: page.q, mode: "insensitive" } }, { comment: { contains: page.q, mode: "insensitive" } }] } : {}) };
    const [total, items] = await Promise.all([prisma.feedback.count({ where }), prisma.feedback.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take })]);
    return { total, items };
  },
  audit: async (page: AdminResourcePageQuery) => {
    const where: Prisma.AuditEventWhereInput = { isDemo: false, ...(page.kind ? { entityType: { contains: page.kind, mode: "insensitive" } } : {}), ...(page.since ? { createdAt: { gte: page.since } } : {}), ...(page.q ? { OR: [{ id: { contains: page.q, mode: "insensitive" } }, { eventType: { contains: page.q, mode: "insensitive" } }, { entityType: { contains: page.q, mode: "insensitive" } }, { entityId: { contains: page.q, mode: "insensitive" } }] } : {}) };
    const [total, items] = await Promise.all([prisma.auditEvent.count({ where }), prisma.auditEvent.findMany({ where, orderBy: { createdAt: "desc" }, skip: page.skip, take: page.take })]);
    return { total, items };
  },
};
