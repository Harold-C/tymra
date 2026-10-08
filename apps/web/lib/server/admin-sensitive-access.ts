import { prisma } from "@tymra/db";
import { redirect } from "next/navigation";
import { getAdminForPage } from "./admin-auth";
import { writeServiceAudit } from "./service-recovery";

export async function recordAdminSensitiveAccess(entityType: string, entityId: string, scope: string) {
  const admin = await getAdminForPage();
  if (!admin) redirect("/admin/sign-in");
  await prisma.$transaction(tx => writeServiceAudit(tx, admin.id, "admin_sensitive_access", entityType, entityId, { scope, authentication: "ADMIN_SESSION", secretFieldsRedacted: true }));
  return admin;
}
