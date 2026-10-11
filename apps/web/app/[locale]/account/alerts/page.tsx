import { AlertsView } from "@/components/member/portal/AlertsView";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "alerts"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <AlertsView locale={params.locale} />; }
