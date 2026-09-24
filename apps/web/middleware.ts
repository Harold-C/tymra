import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";

const internationalizedMiddleware = createMiddleware({
  locales: ["en", "zh"],
  defaultLocale: "en",
  localePrefix: "always",
  localeCookie: {
    name: "NEXT_LOCALE",
    sameSite: "lax",
  },
});

export default function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminApi = pathname === "/api/v1/admin" || pathname.startsWith("/api/v1/admin/");
  const publicOrigin = process.env.PUBLIC_ORIGIN ?? process.env.APP_BASE_URL ?? "https://tymra.test";
  const adminOrigin = process.env.ADMIN_ORIGIN ?? publicOrigin;
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = (request.headers.get("host") || forwardedHost || request.nextUrl.host).toLowerCase();
  const isAdminHost = requestHost === new URL(adminOrigin).host.toLowerCase();
  const adminOnly = process.env.NODE_ENV === "production" && process.env.ADMIN_ONLY_ACCESS !== "false";

  if (adminOnly) {
    const response = isAdminHost && (isAdminPage || isAdminApi)
      ? NextResponse.next()
      : new NextResponse(null, { status: 404 });
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  }

  if (isAdminApi) {
    if (!isAdminHost) {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }
    return NextResponse.next();
  }

  if (isAdminPage) {
    if (!isAdminHost) {
      const destination = new URL(`${pathname}${request.nextUrl.search}`, adminOrigin);
      return NextResponse.redirect(destination, 308);
    }
    return NextResponse.next();
  }

  if (isAdminHost) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return NextResponse.json({ error: { code: "NOT_FOUND", message: "Not found." } }, { status: 404 });
    }
    return NextResponse.redirect(new URL("/admin", adminOrigin), 308);
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) return NextResponse.next();
  const accountMatch = /^\/(en|zh)\/account(?:\/|$)/u.exec(pathname);
  if (accountMatch) {
    const returnTo = `${pathname}${request.nextUrl.search}`;
    if (!request.cookies.get("tymra_customer_session")?.value) {
      const destination = new URL(`/${accountMatch[1]}/sign-in`, publicOrigin);
      destination.searchParams.set("returnTo", returnTo);
      return NextResponse.redirect(destination);
    }
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-tymra-return-to", returnTo);
    return internationalizedMiddleware(new NextRequest(request.url, { method: request.method, headers: requestHeaders }));
  }
  return internationalizedMiddleware(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
