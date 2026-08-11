"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export function LocaleSwitchLink({
  locale,
  label,
  className,
  ariaLabel,
  onClick,
}: {
  locale: "en" | "zh";
  label: string;
  className?: string;
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const targetLocale = locale === "en" ? "zh" : "en";
  const localizedPath = pathname.replace(/^\/(en|zh)(?=\/|$)/, `/${targetLocale}`);
  const localizedQuery = new URLSearchParams(searchParams.toString());
  const returnTo = localizedQuery.get("returnTo");
  if (returnTo && /^\/(en|zh)\/account(?:[/?]|$)/u.test(returnTo)) {
    localizedQuery.set("returnTo", returnTo.replace(/^\/(en|zh)(?=\/|$)/u, `/${targetLocale}`));
  }
  const query = localizedQuery.toString();

  return <Link aria-label={ariaLabel} className={className} href={`${localizedPath}${query ? `?${query}` : ""}`} onClick={onClick}>{label}</Link>;
}
