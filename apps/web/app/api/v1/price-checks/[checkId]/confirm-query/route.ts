import type { NextRequest } from "next/server";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { hasCheckAccess } from "@/lib/server/check-access";
import { confirmQuery } from "@/lib/server/price-checks";
import { MembershipAccessError } from "@/lib/server/membership";
import { memberRequestIdentity, MemberRiskError, setMemberDeviceCookie, verifyMemberChallenge } from "@/lib/server/member-risk";

export async function POST(request: NextRequest, { params }: { params: { checkId: string } }) {
  try {
    if (!(await hasCheckAccess(request, params.checkId))) return apiError(403, "FORBIDDEN", "This Price Check is not available in this session.");
    const input = await request.json() as Record<string, unknown>;
    const identity = memberRequestIdentity(request);
    const challengeVerified = await verifyMemberChallenge(identity, typeof input.challengeToken === "string" ? input.challengeToken : undefined);
    const check = await confirmQuery(params.checkId, input, { identity, challengeVerified });
    const response = apiSuccess({ checkId: check.id, status: check.status });
    setMemberDeviceCookie(response, identity);
    return response;
  } catch (error) {
    if (error instanceof MembershipAccessError) {
      return apiError(error.code === "SPOT_CHECK_QUOTA_REACHED" ? 429 : 409, error.code, error.message);
    }
    if (error instanceof MemberRiskError) {
      return apiError(error.code === "MEMBER_CHALLENGE_REQUIRED" ? 403 : 429, error.code, error.message, {
        headers: { ...(error.retryAfterSeconds ? { "retry-after": String(error.retryAfterSeconds) } : {}), ...(process.env.NODE_ENV === "development" && error.challenge?.token ? { "x-tymra-challenge-token": error.challenge.token } : {}) },
        details: { reasonCodes: error.reasonCodes, challenge: error.challenge },
      });
    }
    return apiException(error);
  }
}
