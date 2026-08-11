import { BillingView } from "@/components/member/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <BillingView locale={params.locale} />; }
