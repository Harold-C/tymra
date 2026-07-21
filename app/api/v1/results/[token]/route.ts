import { getEnvironment } from "@tymra/config";
import { resolveResultLink } from "@tymra/db";

import { apiException, apiSuccess } from "@/lib/server/api";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  try {
    const result = await resolveResultLink(params.token, getEnvironment().RESULT_TOKEN_SECRET);
    return apiSuccess(result);
  } catch (error) {
    return apiException(error);
  }
}
