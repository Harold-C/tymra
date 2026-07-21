import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { getAnonymousCheck } from "@/lib/server/anonymous-checks";

export async function GET(_request: Request, { params }: { params: { checkId: string } }) {
  try {
    const result = await getAnonymousCheck(params.checkId);
    return result ? apiSuccess(result) : apiError(404, "ROUGH_CHECK_NOT_FOUND", "The rough check was not found.");
  } catch (error) {
    return apiException(error);
  }
}
