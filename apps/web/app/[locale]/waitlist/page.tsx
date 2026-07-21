import { getTranslations } from "next-intl/server";

import { PublicShell } from "@/components/public/PublicShell";
import { WaitlistForm } from "@/components/public/PublicForms";

export default async function WaitlistPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { input?: string } }) {
  const t = await getTranslations("Forms");
  return <PublicShell locale={params.locale}><section className="flow-page"><div className="flow-container"><div className="flow-heading"><h1>{t("waitlistTitle")}</h1><p>{t("waitlistIntro")}</p></div><div className="flow-surface"><WaitlistForm locale={params.locale} initialInput={searchParams.input ?? ""} /></div></div></section></PublicShell>;
}
