import { RoughResultExperience } from "@/components/public/RoughResultFlow";

export default function RoughResultPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <RoughResultExperience locale={params.locale} checkId={params.checkId} />;
}
