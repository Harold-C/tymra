import { QueryConfirmation } from "@/components/public/PriceCheckFlow";

export default function QueryPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <QueryConfirmation locale={params.locale} checkId={params.checkId} />;
}
