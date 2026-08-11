import type { Metadata } from "next";
import { Check, CircleGauge, Clock3, MapPinned } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { membershipEntitlements, membershipPlans, type MembershipPlanId } from "@tymra/domain";
import { PublicShell } from "@/components/public/PublicShell";
import { planLaunchAvailability } from "@/lib/server/membership/stripe-billing";

type Locale = "en" | "zh";

export const dynamic = "force-dynamic";

export function generateMetadata({ params }: { params: { locale: Locale } }): Metadata {
  const chinese = params.locale === "zh";
  return {
    title: chinese ? "会员与价格 | Tymra by Synix" : "Membership & pricing | Tymra by Synix",
    description: chinese
      ? "比较 Tymra Free、Host、Pro 和 Portfolio 会员方案、房源额度与未来价格覆盖范围。"
      : "Compare Tymra Free, Host, Pro and Portfolio memberships, property allowances and future-price coverage.",
    alternates: {
      canonical: `/${params.locale}/pricing`,
      languages: { en: "/en/pricing", "zh-CN": "/zh/pricing" },
    },
  };
}

export default async function PricingPage({ params }: { params: { locale: Locale } }) {
  const [t, common] = await Promise.all([
    getTranslations("MembershipPricing"),
    getTranslations("Common"),
  ]);
  const availability = planLaunchAvailability();

  return (
    <PublicShell locale={params.locale}>
      <section className="pricing-page">
        <div className="pricing-container">
          <header className="pricing-hero">
            <span>{t("eyebrow")}</span>
            <h1>{t("title")}</h1>
            <p>{t("intro")}</p>
            <div className="pricing-hero-actions">
              <Link className="button button-primary" href={`/${params.locale}/sign-up`}>{t("createFree")}</Link>
              <Link className="button button-secondary" href={`/${params.locale}/sign-in`}>{common("signIn")}</Link>
            </div>
            <p className="pricing-tax-note">{t("taxNote")}</p>
          </header>

          <div className="public-plan-grid" aria-label={t("comparisonLabel")}>
            {membershipPlans.map((plan) => (
              <PlanCard key={plan} plan={plan} available={availability[plan]} t={t} locale={params.locale} />
            ))}
          </div>

          <section className="pricing-explainer" aria-labelledby="coverage-title">
            <div className="pricing-section-heading">
              <span>{t("coverageEyebrow")}</span>
              <h2 id="coverage-title">{t("coverageTitle")}</h2>
              <p>{t("coverageIntro")}</p>
            </div>
            <div className="pricing-principles">
              <article><MapPinned aria-hidden="true" /><h3>{t("propertyTitle")}</h3><p>{t("propertyBody")}</p></article>
              <article><CircleGauge aria-hidden="true" /><h3>{t("dailyTitle")}</h3><p>{t("dailyBody")}</p></article>
              <article><Clock3 aria-hidden="true" /><h3>{t("monitoringTitle")}</h3><p>{t("monitoringBody")}</p></article>
            </div>
          </section>

          <section className="pricing-trust" aria-labelledby="trust-title">
            <div>
              <span>{t("trustEyebrow")}</span>
              <h2 id="trust-title">{t("trustTitle")}</h2>
            </div>
            <ul>
              <li><Check aria-hidden="true" />{t("trustPrice")}</li>
              <li><Check aria-hidden="true" />{t("trustRecommendation")}</li>
              <li><Check aria-hidden="true" />{t("trustDecision")}</li>
            </ul>
          </section>
        </div>
      </section>
    </PublicShell>
  );
}

function PlanCard({ plan, available, t, locale }: {
  plan: MembershipPlanId;
  available: boolean;
  t: Awaited<ReturnType<typeof getTranslations<"MembershipPricing">>>;
  locale: Locale;
}) {
  const entitlement = membershipEntitlements[plan];
  const isFree = plan === "FREE";
  const price = entitlement.monthlyPriceMinor / 100;
  const schedule = entitlement.scheduledAnalysesPerWeek === 0
    ? t("noSchedule")
    : entitlement.scheduledAnalysesPerWeek === 7
      ? t("dailySchedule")
      : t("weeklySchedule", { count: entitlement.scheduledAnalysesPerWeek });
  const history = t(`plans.${plan}.history`);

  return (
    <article className={`public-plan-card${plan === "HOST" ? " is-featured" : ""}`}>
      <div className="plan-card-topline">
        <span>{t(`plans.${plan}.name`)}</span>
        <small className={available ? "is-available" : "is-planned"}>{available ? t("available") : t("comingSoon")}</small>
      </div>
      <p className="plan-audience">{t(`plans.${plan}.audience`)}</p>
      <p className="plan-price"><strong>NZ${price}</strong><span>{t("perMonth")}</span></p>
      <ul>
        <li><Check aria-hidden="true" />{t("propertySlots", { count: entitlement.activePricingUnitLimit })}</li>
        <li><Check aria-hidden="true" />{t("dailyWindow", { count: entitlement.dailyPriceCheckHorizonDays })}</li>
        <li><Check aria-hidden="true" />{t("monitoringWindow", { count: entitlement.monitoringHorizonDays })}</li>
        <li><Check aria-hidden="true" />{schedule}</li>
        <li><Check aria-hidden="true" />{t("spotChecks", { count: entitlement.rollingSpotCheckLimit })}</li>
        <li><Check aria-hidden="true" />{history}</li>
        <li><Check aria-hidden="true" />{t(`plans.${plan}.capability`)}</li>
        <li><Check aria-hidden="true" />{t(`plans.${plan}.service`)}</li>
      </ul>
      {available ? (
        <Link className={`button ${isFree ? "button-primary" : "button-secondary"}`} href={`/${locale}/sign-up`}>
          {isFree ? t("createFree") : t("choosePlan", { plan: t(`plans.${plan}.name`) })}
        </Link>
      ) : <p className="plan-gate-note">{t("gateNote")}</p>}
    </article>
  );
}
