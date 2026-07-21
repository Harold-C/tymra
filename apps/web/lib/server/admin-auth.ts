import { randomBytes } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { hashOpaqueToken, prisma, verifyOpaqueToken } from "@tymra/db";
import type { AdminUser } from "@prisma/client";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";

export const adminSessionCookie = "tymra_admin_session";
const sessionHours = 8;

export async function createAdminSession(adminUserId: string) {
  const environment = getEnvironment();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionHours * 3_600_000);
  await prisma.adminSession.create({
    data: {
      adminUserId,
      tokenHash: hashOpaqueToken(token, environment.SESSION_SECRET),
      expiresAt,
    },
  });
  return { token, expiresAt };
}

export function setAdminSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(adminSessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnvironment().ADMIN_ORIGIN.startsWith("https://"),
    path: "/",
    expires: expiresAt,
  });
}

export function clearAdminSessionCookie(response: NextResponse) {
  response.cookies.set(adminSessionCookie, "", { httpOnly: true, sameSite: "lax", secure: getEnvironment().ADMIN_ORIGIN.startsWith("https://"), path: "/", maxAge: 0 });
}

export async function getAdminFromRequest(request: NextRequest): Promise<AdminUser | null> {
  return resolveAdminSession(request.cookies.get(adminSessionCookie)?.value);
}

export async function getAdminForPage(): Promise<AdminUser | null> {
  return resolveAdminSession(cookies().get(adminSessionCookie)?.value);
}

export async function revokeAdminSession(token: string | undefined) {
  if (!token) return;
  const environment = getEnvironment();
  const tokenHash = hashOpaqueToken(token, environment.SESSION_SECRET);
  await prisma.adminSession.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(getEnvironment().ADMIN_ORIGIN).origin;
}

async function resolveAdminSession(token: string | undefined): Promise<AdminUser | null> {
  if (!token) return null;
  const tokenHash = hashOpaqueToken(token, getEnvironment().SESSION_SECRET);
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.adminUser.active) return null;
  if (!verifyOpaqueToken(token, session.tokenHash, getEnvironment().SESSION_SECRET)) return null;
  await prisma.adminSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return session.adminUser;
}
