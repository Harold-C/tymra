import { ChecksHistory } from "@/components/member/CustomerPortalViews";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <ChecksHistory locale={params.locale} />; }
