import { GatedFeatureView } from "@/components/member/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <GatedFeatureView locale={params.locale} feature="alerts" minimumPlan="HOST" />; }
