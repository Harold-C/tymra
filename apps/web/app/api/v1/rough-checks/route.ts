import { issueOpaqueToken } from "@tymra/db";
import { getEnvironment } from "@tymra/config";
import { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { createAnonymousCheck, RoughCheckChallengeError, RoughCheckLimitError } from "@/lib/server/anonymous-checks";
import { UnsupportedListingUrlError } from "@/lib/server/listing-input";

const deviceCookie = "tymra_device";

export async function POST(request: NextRequest) {
  const environment = getEnvironment();
  if (!environment.CUSTOMER_FUNNEL_ENABLED) {
    return apiError(503, "CUSTOMER_FUNNEL_PAUSED", "The customer funnel is temporarily paused.");
  }
  const existingDeviceId = request.cookies.get(deviceCookie)?.value;
  const deviceId = existingDeviceId ?? issueOpaqueToken(environment.SESSION_SECRET).token;
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "local-unknown";

  try {
    const result = await createAnonymousCheck(await request.json(), { deviceId, ipAddress });
    const response = apiSuccess(result, { status: result.reused ? 200 : 201 }, { reused: result.reused });
    if (!existingDeviceId) {
      response.cookies.set(deviceCookie, deviceId, {
        httpOnly: true,
        secure: environment.PUBLIC_ORIGIN.startsWith("https://"),
        sameSite: "lax",
        path: "/",
        maxAge: 180 * 86_400,
      });
    }
    return response;
  } catch (error) {
    if (error instanceof UnsupportedListingUrlError) {
      return apiError(422, "UNSUPPORTED_LISTING_URL", error.message, {
        fieldErrors: { input: [error.message] },
      });
    }
    if (error instanceof RoughCheckLimitError) {
      return apiError(429, "ROUGH_CHECK_LIMITED", error.message, {
        headers: { "retry-after": String(error.retryAfterSeconds) },
      });
    }
    if (error instanceof RoughCheckChallengeError) {
      return apiError(403, "ROUGH_CHECK_CHALLENGE_REQUIRED", error.message, {
        headers: environment.NODE_ENV === "development" ? { "x-tymra-challenge-token": error.challengeToken } : undefined,
      });
    }
    return apiException(error);
  }
}
