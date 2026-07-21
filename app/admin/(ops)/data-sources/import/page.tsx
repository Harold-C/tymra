import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminResourcePage";
import { ManualImportPanel } from "@/components/admin/ManualImportPanel";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default function ManualImportPage() {
  const locale = getAdminLocale();
  const text = locale === "zh" ? zh : en;
  return <section className="admin-page manual-import-page"><AdminPageHeader title={text.title} description={text.description} actions={<Link className="button button-secondary" href="/admin/data-sources">{text.back}</Link>} /><ManualImportPanel locale={locale} /></section>;
}

const en = { title: "Manual rate import", description: "Validate and import approved CSV or JSON rate observations into the canonical dataset.", back: "Back to data sources" };
const zh: typeof en = { title: "手工价格导入", description: "校验经过授权的 CSV 或 JSON 价格观测数据，并导入标准数据集。", back: "返回数据来源" };
