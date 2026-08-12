import { ArgusManualActionsPanel } from "@/components/admin/ArgusManualActionsPanel";
import { getAdminLocale } from "@/lib/server/admin-locale";
import { listArgusManualActions } from "@/lib/server/argus-manual-actions";

export const dynamic = "force-dynamic";

export default async function ArgusManualActionsPage() {
  return <ArgusManualActionsPanel actions={await listArgusManualActions()} locale={getAdminLocale()} />;
}
