import { getEnvironment } from "@tymra/config";
import { NextRequest, NextResponse } from "next/server";

import { setCustomerSessionCookie } from "@/lib/server/customer-auth";
import { consumeMagicLink } from "@/lib/server/magic-links";
import { memberRequestIdentity, setMemberDeviceCookie } from "@/lib/server/member-risk";

export async function GET(request: NextRequest, { params }: { params: { locale: string } }) {
  const locale = params.locale === "zh" ? "zh" : "en";
  const publicBaseUrl = getEnvironment().PUBLIC_ORIGIN;
  const token = request.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.redirect(new URL(`/${locale}/auth/error`, publicBaseUrl));

  try {
    const identity = memberRequestIdentity(request);
    const result = await consumeMagicLink(token, identity);
    const destination = result.priceCheckId
      ? `/${result.locale}/account/checks/${result.priceCheckId}`
      : result.purpose === "VERIFY_CUSTOMER_EMAIL"
        ? `/${result.locale}/account?verified=email`
        : `/${result.locale}/account?blocked=${encodeURIComponent(result.blockReason ?? "MEMBERSHIP_INACTIVE")}`;
    const response = NextResponse.redirect(new URL(destination, publicBaseUrl));
    setCustomerSessionCookie(response, result.sessionToken);
    setMemberDeviceCookie(response, identity);
    return response;
  } catch {
    return NextResponse.redirect(new URL(`/${locale}/auth/error`, publicBaseUrl));
  }
}
