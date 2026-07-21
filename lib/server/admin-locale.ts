import { cookies } from "next/headers";

import { normalizeAdminLocale, type AdminLocale } from "@/lib/admin-i18n";

export const adminLocaleCookie = "TYMRA_ADMIN_LOCALE";

export function getAdminLocale(): AdminLocale {
  const cookieStore = cookies();
  return normalizeAdminLocale(cookieStore.get(adminLocaleCookie)?.value ?? cookieStore.get("NEXT_LOCALE")?.value);
}
