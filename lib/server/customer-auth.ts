import { getEnvironment } from "@tymra/config";
import { hashOpaqueToken, issueOpaqueToken, prisma } from "@tymra/db";
import { NextRequest, NextResponse } from "next/server";

export const customerSessionCookie = "tymra_customer_session";

export async function getCustomerSession(request: NextRequest) {
  const token = request.cookies.get(customerSessionCookie)?.value;
  if (!token) return null;
  const environment = getEnvironment();
  const tokenHash = hashOpaqueToken(token, environment.SESSION_SECRET);
  const session = await prisma.customerSession.findUnique({
    where: { tokenHash },
    include: { customerUser: true },
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

export function issueCustomerSessionToken() {
  return issueOpaqueToken(getEnvironment().SESSION_SECRET);
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

export class CustomerAuthenticationError extends Error {
  constructor() {
    super("A valid customer session is required.");
    this.name = "CustomerAuthenticationError";
  }
}
