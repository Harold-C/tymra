import { prisma } from "@tymra/db";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getAdminFromRequest, isSameOrigin } from "@/lib/server/admin-auth";
import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { writeServiceAudit } from "@/lib/server/service-recovery";
const schema = z.object({ action: z.literal("REVOKE"), reason: z.string().trim().min(3).max(1000) }).strict();
export async function POST(request: NextRequest, { params }: { params: { sessionId: string } }) {
  try {
    const admin = await getAdminFromRequest(request);
    if (!admin || !isSameOrigin(request)) return apiError(403, "FORBIDDEN", "Administrator access and same origin are required.");
    const input = schema.parse(await request.json());
    const result = await prisma.$transaction(async tx => {
      const session = await tx.adminSession.findUnique({ where: { id: params.sessionId } });
      if (!session) return null;
      await tx.adminSession.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await writeServiceAudit(tx, admin.id, "admin_session_revoked", "AdminSession", session.id, { reason: input.reason, ownerAdminId: session.adminUserId, expiresAt: session.expiresAt.toISOString() });
      return { revoked: true };
    });
    return result ? apiSuccess(result) : apiError(404, "SESSION_NOT_FOUND", "Session not found.");
  } catch(error) { return apiException(error); }
}
