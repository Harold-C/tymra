import { PriceCalendar } from "@/components/member/CustomerPortalViews";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "calendar"); }
export default function Page({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { pricingUnitId?: string } }) { return <PriceCalendar locale={params.locale} initialPricingUnitId={searchParams.pricingUnitId} />; }
