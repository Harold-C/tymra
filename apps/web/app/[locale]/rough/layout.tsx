import type { Metadata } from "next";

import { PublicShell } from "@/components/public/PublicShell";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function RoughLayout({ children, params }: { children: React.ReactNode; params: { locale: "en" | "zh" } }) {
  return <PublicShell locale={params.locale}>{children}</PublicShell>;
}
