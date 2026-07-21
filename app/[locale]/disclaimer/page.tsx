import { PublicContentPage } from "@/components/public/PublicContentPage";
export default function Page({ params }: { params: { locale: "en" | "zh" } }) { return <PublicContentPage locale={params.locale} contentKey="disclaimer" />; }
