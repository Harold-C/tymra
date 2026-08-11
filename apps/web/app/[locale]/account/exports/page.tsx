import { ExportsView } from "@/components/member/CustomerPortalViews";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "exports"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <ExportsView locale={params.locale} />; }
