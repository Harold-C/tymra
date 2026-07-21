import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";

import { normalizeAdminLocale } from "@/lib/admin-i18n";

import "./globals.css";

export const metadata: Metadata = {
  title: "Tymra by Synix | Accommodation Pricing Intelligence",
  description:
    "Accommodation pricing intelligence for New Zealand hotels, motels and short-stay operators.",
  openGraph: {
    title: "Tymra by Synix | Accommodation Pricing Intelligence",
    description:
      "Find the dates you may be selling too cheaply with explainable New Zealand accommodation market data.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Tymra by Synix | Accommodation Pricing Intelligence",
    description:
      "Find the dates you may be selling too cheaply with explainable New Zealand accommodation market data.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = cookies();
  const locale = normalizeAdminLocale(cookieStore.get("TYMRA_ADMIN_LOCALE")?.value ?? cookieStore.get("NEXT_LOCALE")?.value);
  return (
    <html lang={locale === "zh" ? "zh-CN" : "en"}>
      <body>{children}</body>
    </html>
  );
}
