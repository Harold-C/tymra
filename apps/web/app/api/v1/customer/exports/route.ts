import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { MembershipAccessError, MembershipOperationError } from "@/lib/server/membership/membership";
import { createMemberExport, downloadMemberExport, listMemberExports } from "@/lib/server/membership/member-exports";

export async function GET(request: NextRequest) {
  try {
    const session = await requireCustomerSession(request);
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return apiSuccess(await listMemberExports(session.customerUserId));
    const format = z.enum(["csv", "xlsx"]).parse(request.nextUrl.searchParams.get("format") ?? "csv");
    const file = await downloadMemberExport(session.customerUserId, id, format);
    if (!file) return apiError(404, "EXPORT_NOT_FOUND", "This export is unavailable or has expired.");
    return new NextResponse(new Uint8Array(file.content), { headers: { "content-type": file.contentType, "content-disposition": `attachment; filename="tymra-price-checks.${format}"`, "cache-control": "private, no-store" } });
  } catch (error) { return failure(error); }
}

export async function POST(request: NextRequest) {
  try {
    if (!isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    const input = z.object({ exitExport: z.boolean().default(false) }).parse(await request.json());
    const key = z.string().min(1).max(128).parse(request.headers.get("idempotency-key"));
    return apiSuccess(await createMemberExport(session.customerUserId, key, input.exitExport));
  } catch (error) { return failure(error); }
}

function failure(error: unknown) {
  if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
  if (error instanceof MembershipAccessError || error instanceof MembershipOperationError) return apiError(error.code.includes("QUOTA") ? 429 : 403, error.code, error.message);
  return apiException(error);
}
