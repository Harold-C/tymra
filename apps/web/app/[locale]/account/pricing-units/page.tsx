import { PricingUnitsView } from "@/components/public/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <PricingUnitsView locale={params.locale} />; }
