import { PricingUnitsView } from "@/components/member/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <PricingUnitsView locale={params.locale} />; }
