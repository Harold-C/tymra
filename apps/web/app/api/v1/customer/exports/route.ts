import { prisma } from "@tymra/db";
import { NextRequest, NextResponse } from "next/server";

import { apiError, apiException } from "@/lib/server/api";
import { CustomerAuthenticationError, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { MembershipAccessError, MembershipOperationError, reserveMembershipOperation } from "@/lib/server/membership/membership";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const idempotencyKey = request.headers.get("idempotency-key") ?? "";
    await reserveMembershipOperation({ customerUserId: session.customerUserId, action: "MEMBER_EXPORT", idempotencyKey });
    const checks = await prisma.priceCheck.findMany({ where: { customerUserId: session.customerUserId }, orderBy: { createdAt: "desc" }, include: { property: true, unit: true, stayQuery: true }, take: 5_000 });
    const rows = [["check_id", "status", "property", "unit", "check_in", "check_out", "created_at"], ...checks.map((check) => [check.id, check.status, check.property?.canonicalName ?? "", check.unit?.officialName ?? "", check.stayQuery?.checkIn.toISOString().slice(0, 10) ?? "", check.stayQuery?.checkOut.toISOString().slice(0, 10) ?? "", check.createdAt.toISOString()])];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    return new NextResponse(csv, { status: 200, headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="tymra-price-checks-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof MembershipAccessError || error instanceof MembershipOperationError) return apiError(error.code.includes("QUOTA") ? 429 : 403, error.code, error.message);
    return apiException(error);
  }
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
