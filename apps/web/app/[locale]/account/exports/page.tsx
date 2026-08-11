import { ExportsView } from "@/components/member/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <ExportsView locale={params.locale} />; }
