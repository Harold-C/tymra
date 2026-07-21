import { UnitConfirmation } from "@/components/public/PriceCheckFlow";

export default function UnitPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <UnitConfirmation locale={params.locale} checkId={params.checkId} />;
}
