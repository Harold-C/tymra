import { BillingView } from "@/components/member/CustomerPortalViews";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "billing"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <BillingView locale={params.locale} />; }
