"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";

export function AdminSignOut({ locale }: { locale: AdminLocale }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function signOut() {
    setBusy(true);
    await fetch("/api/v1/admin/session", { method: "DELETE" });
    router.replace("/admin/sign-in");
    router.refresh();
  }
  const label = adminText(locale, "signOut");
  return <button className="icon-button" type="button" aria-label={label} title={label} onClick={signOut} disabled={busy}><LogOut size={17} /></button>;
}
