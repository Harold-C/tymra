import { getEnvironment } from "@tymra/config";
import { prisma } from "@tymra/db";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { AdminShell } from "@/components/admin/AdminShell";
import { getAdminForPage } from "@/lib/server/admin-auth";
import { getAdminLocale } from "@/lib/server/admin-locale";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Tymra Operations Console", robots: { index: false, follow: false } };

export default async function OperationsLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminForPage();
  if (!admin) redirect("/admin/sign-in");
  const environment = getEnvironment();
  const [businessExceptions, collectionIncidents] = await Promise.all([
    prisma.exceptionCase.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
    prisma.collectionIncident.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, isDemo: false } }),
  ]);
  return (
    <AdminShell
      email={admin.email}
      locale={getAdminLocale()}
      environment={environment.NODE_ENV}
      schedulerEnabled={environment.SCHEDULER_ENABLED}
      pendingCount={businessExceptions + collectionIncidents}
    >
      {children}
    </AdminShell>
  );
}
