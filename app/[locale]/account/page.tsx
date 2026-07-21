import { CustomerAccount } from "@/components/public/CustomerAccountViews";

export default function AccountPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { quota?: string } }) {
  return <CustomerAccount locale={params.locale} quotaReached={searchParams.quota === "reached"} />;
}
