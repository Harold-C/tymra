"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";

export function AdminLanguageSwitch({ locale }: { locale: AdminLocale }) {
  const router = useRouter();

  function select(nextLocale: AdminLocale) {
    if (nextLocale === locale) return;
    document.cookie = `TYMRA_ADMIN_LOCALE=${nextLocale}; Path=/admin; Max-Age=31536000; SameSite=Lax; Secure`;
    document.documentElement.lang = nextLocale === "zh" ? "zh-CN" : "en";
    router.refresh();
  }

  return (
    <div className="admin-language-control" role="group" aria-label={adminText(locale, "language")}>
      <Languages size={16} aria-hidden="true" />
      <button type="button" aria-pressed={locale === "en"} onClick={() => select("en")}>{adminText(locale, "english")}</button>
      <button type="button" aria-pressed={locale === "zh"} onClick={() => select("zh")}>{adminText(locale, "chinese")}</button>
    </div>
  );
}
