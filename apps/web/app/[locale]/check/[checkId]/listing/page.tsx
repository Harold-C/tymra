import { ListingConfirmation } from "@/components/public/PriceCheckFlow";

export default function ListingPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  return <ListingConfirmation locale={params.locale} checkId={params.checkId} />;
}
