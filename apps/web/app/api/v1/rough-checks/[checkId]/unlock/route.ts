import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { InvalidMagicLinkError, requestMagicLink } from "@/lib/server/membership/magic-links";

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local-unknown";
  try {
    return apiSuccess(await requestMagicLink(params.checkId, await request.json(), { ipAddress }), { status: 202 });
  } catch (error) {
    if (error instanceof InvalidMagicLinkError) {
      return apiError(404, "ROUGH_CHECK_NOT_AVAILABLE", "This rough check is no longer available.");
    }
    return apiException(error);
  }
}
