import { prisma, Prisma, type RiskCaseStatus } from "@tymra/db";

import { adminListState } from "@/lib/admin-list";

export const membershipRiskStatuses: RiskCaseStatus[] = ["OPEN", "APPROVED", "DENIED", "RESOLVED"];

export async function listMembershipRiskCases(searchParams: Record<string, string | undefined>, customerUserId?: string) {
  const { page, pageSize, skip } = adminListState(searchParams);
  const q = searchParams.q?.trim().slice(0, 100) ?? "";
  const status = membershipRiskStatuses.includes(searchParams.status as RiskCaseStatus) ? searchParams.status as RiskCaseStatus : undefined;
  const period = searchParams.period === "30d" ? "30d" : "all";
  const where: Prisma.MembershipRiskCaseWhereInput = {
    ...(customerUserId ? { customerUserId } : {}),
    ...(period === "30d" ? { createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ customerUserId: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, cases] = await Promise.all([
    prisma.membershipRiskCase.count({ where }),
    prisma.membershipRiskCase.findMany({ where, orderBy: [{ status: "asc" }, { createdAt: "desc" }, { id: "desc" }], skip, take: pageSize }),
  ]);
  return { total, cases, page, pageSize, q, status, period };
}

export async function membershipRiskSummary(since: Date, customerUserId?: string) {
  const scope = customerUserId ? { customerUserId } : {};
  const where = { ...scope, createdAt: { gte: since } };
  const [groups, open, appealed, reasons] = await Promise.all([
    prisma.membershipRiskCase.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.membershipRiskCase.count({ where: { ...scope, status: "OPEN" } }),
    prisma.membershipRiskCase.count({ where: { ...where, AND: [{ appealReason: { not: null } }, { appealReason: { not: "" } }] } }),
    prisma.$queryRaw<Array<{ reason: string; count: bigint }>>(Prisma.sql`
      SELECT reason #>> '{}' AS reason, COUNT(*) AS count
      FROM "MembershipRiskCase" risk
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(risk."reasonCodes") = 'array' THEN risk."reasonCodes" ELSE '[]'::jsonb END
      ) AS reason
      WHERE risk."createdAt" >= ${since}
        AND (${customerUserId ?? null}::text IS NULL OR risk."customerUserId" = ${customerUserId ?? null})
        AND jsonb_typeof(reason) = 'string'
      GROUP BY reason ORDER BY count DESC, reason ASC LIMIT 8
    `),
  ]);
  const approved = groups.find(group => group.status === "APPROVED")?._count._all ?? 0;
  const denied = groups.find(group => group.status === "DENIED")?._count._all ?? 0;
  return {
    total: groups.reduce((sum, group) => sum + group._count._all, 0), open, appealed,
    approved, reviewed: approved + denied,
    topReasons: reasons.map(row => ({ reason: row.reason, count: Number(row.count) })),
  };
}

export async function customerMembershipRiskSupport(customerUserId: string, searchParams: Record<string, string | undefined>) {
  const [list, selected, open] = await Promise.all([
    listMembershipRiskCases({ page: searchParams.riskPage, pageSize: searchParams.riskPageSize }, customerUserId),
    searchParams.riskCase ? prisma.membershipRiskCase.findFirst({ where: { id: searchParams.riskCase, customerUserId } }) : null,
    prisma.membershipRiskCase.count({ where: { customerUserId, status: "OPEN" } }),
  ]);
  return { ...list, open, cases: selected && !list.cases.some(item => item.id === selected.id) ? [selected, ...list.cases] : list.cases };
}
