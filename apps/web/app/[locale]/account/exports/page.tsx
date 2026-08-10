import { ExportsView } from "@/components/public/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <ExportsView locale={params.locale} />; }
