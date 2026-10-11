import { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { CustomerAuthenticationError, isCustomerSameOrigin, requireCustomerSession } from "@/lib/server/membership/customer-auth";
import { applyMemberStrategy, getMemberPortfolio, MemberFeatureError, previewMemberStrategy } from "@/lib/server/membership/member-portfolio";

async function handle(request: NextRequest, mode: "read" | "preview" | "apply") {
  try {
    if (mode !== "read" && !isCustomerSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const session = await requireCustomerSession(request);
    if (mode === "read") return apiSuccess(await getMemberPortfolio(session.customerUserId));
    const body = await request.json();
    if (mode === "preview") return apiSuccess(await previewMemberStrategy(session.customerUserId, body));
    const input = z.object({ previewToken: z.string().max(100000) }).parse(body);
    return apiSuccess(await applyMemberStrategy(session.customerUserId, input.previewToken, request.headers.get("idempotency-key") ?? ""));
  } catch (error) {
    if (error instanceof CustomerAuthenticationError) return apiError(401, "CUSTOMER_AUTH_REQUIRED", error.message);
    if (error instanceof MemberFeatureError) return apiError(error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 403, error.code, error.message);
    return apiException(error);
  }
}
export const GET = (request: NextRequest) => handle(request, "read");
export const POST = (request: NextRequest) => handle(request, "preview");
export const PATCH = (request: NextRequest) => handle(request, "apply");
