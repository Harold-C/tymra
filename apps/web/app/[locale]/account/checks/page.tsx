import { ChecksHistory } from "@/components/member/CustomerPortalViews";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "checks"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <ChecksHistory locale={params.locale} />; }
