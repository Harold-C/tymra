import { createHmac } from "node:crypto";

import { getEnvironment } from "@tymra/config";
import { hashOpaqueToken, prisma, verifyOpaqueToken } from "@tymra/db";
import type { NextRequest, NextResponse } from "next/server";

export function checkAccessCookieName(checkId: string) {
  return `tymra_check_${checkId}`;
}

export function deriveCheckAccessKey(idempotencyKey: string): string {
  const environment = getEnvironment();
  return createHmac("sha256", environment.ACCESS_KEY_SECRET).update(idempotencyKey).digest("base64url");
}

export function setCheckAccessCookie(response: NextResponse, checkId: string, accessKey: string) {
  response.cookies.set(checkAccessCookieName(checkId), accessKey, {
    httpOnly: true,
    sameSite: "lax",
    secure: getEnvironment().PUBLIC_ORIGIN.startsWith("https://"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function hasCheckAccess(request: NextRequest, checkId: string): Promise<boolean> {
  const accessKey = request.cookies.get(checkAccessCookieName(checkId))?.value;
  if (!accessKey) return false;
  const check = await prisma.priceCheck.findUnique({ where: { id: checkId }, select: { accessKeyHash: true } });
  return Boolean(check && verifyOpaqueToken(accessKey, check.accessKeyHash, getEnvironment().ACCESS_KEY_SECRET));
}

export function checkAccessHash(accessKey: string) {
  return hashOpaqueToken(accessKey, getEnvironment().ACCESS_KEY_SECRET);
}
