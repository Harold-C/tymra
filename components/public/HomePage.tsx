import { ArrowRight, BarChart3, CalendarSearch, CheckCircle2, MapPin, Search, ShieldCheck, Signal } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { PublicShell } from "./PublicShell";
import { SignalLandscape } from "./SignalLandscape";

export async function HomePage({ locale }: { locale: "en" | "zh" }) {
  const t = await getTranslations("Home");
  const common = await getTranslations("Common");
  const nav = await getTranslations("Nav");
  const capabilities = [
    { key: "risk", icon: ShieldCheck },
    { key: "median", icon: BarChart3 },
    { key: "signals", icon: Signal },
    { key: "actions", icon: CheckCircle2 },
  ] as const;
  const steps = [
    { title: "step1Title", body: "step1Body", icon: Search },
    { title: "step2Title", body: "step2Body", icon: CalendarSearch },
    { title: "step3Title", body: "step3Body", icon: CheckCircle2 },
  ] as const;

  return (
    <PublicShell locale={locale}>
      <section className="home-hero">
        <div className="public-container hero-grid">
          <div className="hero-copy">
            <h1>{t("title")}</h1>
            <p className="hero-value">{t("value")}</p>
            <form className="home-search" action={`/${locale}/check`} method="get">
              <label htmlFor="home-property-search">{t("searchLabel")}</label>
              <div className="home-search-row">
                <Search aria-hidden="true" size={22} />
                <input id="home-property-search" name="input" minLength={3} maxLength={500} placeholder={t("searchPlaceholder")} required />
                <button className="button button-primary" type="submit">{common("runCheck")}<ArrowRight size={18} /></button>
              </div>
              <div className="search-meta"><span><MapPin size={16} />{t("scope")}</span><span>{t("boundary")}</span></div>
            </form>
          </div>
          <SignalLandscape />
        </div>
      </section>

      <section className="capability-band" aria-labelledby="capability-heading">
        <div className="public-container">
          <div className="section-heading"><h2 id="capability-heading">{t("capabilityTitle")}</h2><p>{t("capabilityBody")}</p></div>
          <div className="capability-grid">
            {capabilities.map(({ key, icon: Icon }) => <article className="capability-item" key={key}><Icon size={22} /><span>{t("example")}</span><h3>{t(key)}</h3></article>)}
          </div>
        </div>
      </section>

      <section className="content-section" id="how-it-works" aria-labelledby="how-heading">
        <div className="public-container"><div className="section-heading"><h2 id="how-heading">{t("howTitle")}</h2></div><ol className="steps-list">{steps.map(({ title, body, icon: Icon }, index) => <li key={title}><div className="step-icon"><Icon size={22} /></div><div><span>0{index + 1}</span><h3>{t(title)}</h3><p>{t(body)}</p></div></li>)}</ol></div>
      </section>

      <section className="content-section muted-section" id="what-you-get" aria-labelledby="what-heading">
        <div className="public-container split-content"><div><h2 id="what-heading">{t("whatTitle")}</h2><p>{t("whatBody")}</p></div><div><h3>{t("marketTitle")}</h3><p>{t("marketBody")}</p><Link className="text-link" href={`/${locale}/methodology`}>{nav("methodology")} <ArrowRight size={16} /></Link></div></div>
      </section>

      <section className="final-cta"><div className="public-container"><h2>{t("finalTitle")}</h2><p>{t("finalBody")}</p><Link className="button button-primary" href={`/${locale}/check`}>{common("runCheck")}<ArrowRight size={18} /></Link></div></section>
    </PublicShell>
  );
}
