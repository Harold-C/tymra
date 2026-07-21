import { CustomerCheckExperience } from "@/components/public/CustomerAccountViews";

export default function CustomerCheckPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <CustomerCheckExperience locale={params.locale} checkId={params.checkId} />;
}
