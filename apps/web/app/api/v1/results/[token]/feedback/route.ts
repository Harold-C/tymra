import { getEnvironment } from "@tymra/config";
import { prisma, resolveResultLink } from "@tymra/db";
import { feedbackSchema } from "@tymra/domain";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";

export async function POST(request: Request, { params }: { params: { token: string } }) {
  try {
    const resolved = await resolveResultLink(params.token, getEnvironment().RESULT_TOKEN_SECRET);
    if (!resolved.result) return apiError(404, resolved.state, "This result is not available.");
    const input = feedbackSchema.parse(await request.json());
    const feedback = await prisma.feedback.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        priceCheckId: resolved.result.priceCheckId,
        resultVersionId: resolved.result.id,
        insightId: input.insightId,
        type: input.feedbackType,
        comment: input.comment,
        idempotencyKey: input.idempotencyKey,
        isDemo: resolved.result.isDemo,
      },
      update: {},
    });
    if (input.feedbackType === "REPORT_ISSUE") {
      await prisma.exceptionCase.create({
        data: {
          priceCheckId: resolved.result.priceCheckId,
          type: "USER_REPORT",
          priority: "P1",
          recommendation: "REANALYSE",
          evidence: { feedbackId: feedback.id },
          allowedActions: ["REANALYSE", "MARK_PARTIAL", "WITHDRAW_RESULT"],
          blockingUser: true,
          isDemo: resolved.result.isDemo,
        },
      });
    }
    return apiSuccess({ feedbackId: feedback.id }, { status: 201 });
  } catch (error) {
    return apiException(error);
  }
}
