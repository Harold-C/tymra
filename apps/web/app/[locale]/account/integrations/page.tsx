import { GatedFeatureView } from "@/components/member/CustomerPortalViews";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "integrations"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <GatedFeatureView locale={params.locale} feature="integrations" minimumPlan="PORTFOLIO" />; }
