import { CheckStartForm } from "@/components/public/PriceCheckFlow";

export default function AddressCheckPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { input?: string } }) {
  return <CheckStartForm locale={params.locale} initialInput={searchParams.input ?? ""} />;
}
