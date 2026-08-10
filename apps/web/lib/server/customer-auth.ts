import { getEnvironment } from "@tymra/config";
import { hashOpaqueToken, issueOpaqueToken, prisma } from "@tymra/db";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export const customerSessionCookie = "tymra_customer_session";

export async function getCustomerSession(request: NextRequest) {
  const token = request.cookies.get(customerSessionCookie)?.value;
  return resolveCustomerSession(token);
}

export async function getCustomerSessionForPage() {
  return resolveCustomerSession(cookies().get(customerSessionCookie)?.value);
}

async function resolveCustomerSession(token: string | undefined) {
  if (!token) return null;
  const environment = getEnvironment();
  const tokenHash = hashOpaqueToken(token, environment.SESSION_SECRET);
  const session = await prisma.customerSession.findUnique({
    where: { tokenHash },
    include: { customerUser: { include: { membership: true } } },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.customerUser.status !== "ACTIVE") return null;
  await prisma.customerSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return session;
}

export async function requireCustomerSession(request: NextRequest) {
  const session = await getCustomerSession(request);
  if (!session) throw new CustomerAuthenticationError();
  return session;
}

export function isCustomerSameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(getEnvironment().PUBLIC_ORIGIN).origin);
}

export function issueCustomerSessionToken() {
  return issueOpaqueToken(getEnvironment().SESSION_SECRET);
}

export async function createCustomerSession(customerUserId: string, revokeExisting = false, identity?: { deviceHash: string; ipPrefixHash: string }) {
  const environment = getEnvironment();
  const issued = issueCustomerSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + environment.CUSTOMER_SESSION_TTL_DAYS * 86_400_000);
  await prisma.$transaction(async (transaction) => {
    if (revokeExisting) {
      await transaction.customerSession.updateMany({
        where: { customerUserId, revokedAt: null, expiresAt: { gt: now } },
        data: { revokedAt: now },
      });
    }
    await transaction.customerSession.create({
      data: { customerUserId, tokenHash: issued.tokenHash, expiresAt, deviceHash: identity?.deviceHash, ipPrefixHash: identity?.ipPrefixHash },
    });
  });
  return { token: issued.token, expiresAt };
}

export function setCustomerSessionCookie(response: NextResponse, token: string) {
  const environment = getEnvironment();
  response.cookies.set(customerSessionCookie, token, {
    httpOnly: true,
    secure: environment.PUBLIC_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: environment.CUSTOMER_SESSION_TTL_DAYS * 86_400,
  });
}

export function clearCustomerSessionCookie(response: NextResponse) {
  response.cookies.set(customerSessionCookie, "", {
    httpOnly: true,
    secure: getEnvironment().PUBLIC_ORIGIN.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function revokeCustomerSession(request: NextRequest, allSessions = false) {
  const session = await requireCustomerSession(request);
  const revokedAt = new Date();
  if (allSessions) {
    await prisma.customerSession.updateMany({
      where: { customerUserId: session.customerUserId, revokedAt: null },
      data: { revokedAt },
    });
  } else {
    await prisma.customerSession.update({ where: { id: session.id }, data: { revokedAt } });
  }
  return { revoked: true as const, allSessions };
}

export class CustomerAuthenticationError extends Error {
  constructor() {
    super("A valid customer session is required.");
    this.name = "CustomerAuthenticationError";
  }
}
