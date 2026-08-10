"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CustomerSignOut({ locale, label, compact = false }: { locale: "en" | "zh"; label: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/v1/customer/session", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
    } finally {
      router.push(`/${locale}`);
      router.refresh();
    }
  }

  return <button className={compact ? "session-action session-action-compact" : "session-action"} type="button" onClick={() => void signOut()} disabled={busy}><LogOut aria-hidden="true" />{label}</button>;
}
