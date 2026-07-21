import { CheckStatus } from "@/components/public/PriceCheckFlow";

export default function StatusPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <CheckStatus locale={params.locale} checkId={params.checkId} />;
}
