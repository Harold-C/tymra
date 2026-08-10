import { SettingsView } from "@/components/public/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <SettingsView locale={params.locale} />; }
