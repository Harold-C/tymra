import { AdminResourcePage } from "@/components/admin/AdminResourcePage";
import { ManualImportPanel } from "@/components/admin/ManualImportPanel";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default function Page() {
  return <><AdminResourcePage resource="dataSources" /><ManualImportPanel locale={getAdminLocale()} /></>;
}
