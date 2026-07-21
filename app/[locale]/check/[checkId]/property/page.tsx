import { PropertyConfirmation } from "@/components/public/PriceCheckFlow";

export default function PropertyPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <PropertyConfirmation locale={params.locale} checkId={params.checkId} />;
}
