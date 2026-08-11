import { SettingsView } from "@/components/member/CustomerPortalViews";
import { getAccountMetadata } from "@/lib/account-metadata";
export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "settings"); }
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <SettingsView locale={params.locale} />; }
