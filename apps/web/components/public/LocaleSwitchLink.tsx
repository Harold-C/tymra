"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function LocaleSwitchLink({ locale, label, className }: { locale: "en" | "zh"; label: string; className?: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetLocale = locale === "en" ? "zh" : "en";
  const localizedPath = pathname.replace(/^\/(en|zh)(?=\/|$)/, `/${targetLocale}`);
  const query = searchParams.toString();

  return <Link className={className} href={`${localizedPath}${query ? `?${query}` : ""}`}>{label}</Link>;
}
