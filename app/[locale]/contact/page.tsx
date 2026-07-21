import { getTranslations } from "next-intl/server";

import { PublicShell } from "@/components/public/PublicShell";
import { ContactForm } from "@/components/public/PublicForms";

export default async function ContactPage({ params }: { params: { locale: "en" | "zh" } }) {
  const t = await getTranslations("Forms");
  return <PublicShell locale={params.locale}><section className="flow-page"><div className="flow-container"><div className="flow-heading"><h1>{t("contactTitle")}</h1><p>{t("contactIntro")}</p></div><div className="flow-surface"><ContactForm locale={params.locale} /></div></div></section></PublicShell>;
}
