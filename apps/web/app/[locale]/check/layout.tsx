import { notFound } from "next/navigation";

import { PublicShell } from "@/components/public/PublicShell";

export default function CheckLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  if (params.locale !== "en" && params.locale !== "zh") notFound();
  return <PublicShell locale={params.locale}>{children}</PublicShell>;
}
