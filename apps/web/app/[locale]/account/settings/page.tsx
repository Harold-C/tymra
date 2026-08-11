import { SettingsView } from "@/components/member/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <SettingsView locale={params.locale} />; }
