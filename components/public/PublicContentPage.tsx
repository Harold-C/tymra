import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PublicShell } from "./PublicShell";

type Locale = "en" | "zh";
type ContentKey = "methodology" | "faq" | "privacy" | "terms" | "cookies" | "disclaimer" | "deleteData";

export async function PublicContentPage({ locale, contentKey }: { locale: Locale; contentKey: ContentKey }) {
  const t = await getTranslations("Content");
  const common = await getTranslations("Common");
  return (
    <PublicShell locale={locale}>
      <section className="content-page">
        <div className="content-page-container">
          <header><span>{t(`${contentKey}.eyebrow`)}</span><h1>{t(`${contentKey}.title`)}</h1><p>{t(`${contentKey}.intro`)}</p></header>
          <div className="prose-sections">
            {[1, 2, 3, 4].map((index) => (
              <section key={index}><h2>{t(`${contentKey}.section${index}Title`)}</h2><p>{t(`${contentKey}.section${index}Body`)}</p></section>
            ))}
          </div>
          {contentKey === "deleteData" ? <Link className="button button-primary" href={`/${locale}/contact`}>{common("contact")}<ArrowRight size={18} /></Link> : null}
        </div>
      </section>
    </PublicShell>
  );
}
