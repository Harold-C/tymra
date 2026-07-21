import { prisma } from "@tymra/db";
import bcrypt from "bcryptjs";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { apiError, apiException, apiSuccess } from "@/lib/server/api";
import { adminSessionCookie, clearAdminSessionCookie, createAdminSession, isSameOrigin, revokeAdminSession, setAdminSessionCookie } from "@/lib/server/admin-auth";

const minimumPasswordLength = process.env.NODE_ENV === "development" ? 6 : 8;
const schema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(minimumPasswordLength).max(200) });

export async function POST(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    const input = schema.parse(await request.json());
    const admin = await prisma.adminUser.findUnique({ where: { email: input.email } });
    if (!admin || !admin.active || !(await bcrypt.compare(input.password, admin.passwordHash))) {
      return apiError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
    }
    const session = await createAdminSession(admin.id);
    const response = apiSuccess({ admin: { id: admin.id, email: admin.email } }, { status: 201 });
    setAdminSessionCookie(response, session.token, session.expiresAt);
    return response;
  } catch (error) {
    return apiException(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!isSameOrigin(request)) return apiError(403, "ORIGIN_FORBIDDEN", "The request origin is not allowed.");
    await revokeAdminSession(request.cookies.get(adminSessionCookie)?.value);
    const response = apiSuccess({ signedOut: true });
    clearAdminSessionCookie(response);
    return response;
  } catch (error) {
    return apiException(error);
  }
}
