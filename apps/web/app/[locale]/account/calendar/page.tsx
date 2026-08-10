import { PriceCalendar } from "@/components/public/CustomerPortalViews";
export default function Page({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { pricingUnitId?: string } }) { return <PriceCalendar locale={params.locale} initialPricingUnitId={searchParams.pricingUnitId} />; }
