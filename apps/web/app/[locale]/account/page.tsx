import { CustomerAccount } from "@/components/public/CustomerAccountViews";
import { getCustomerSessionForPage } from "@/lib/server/customer-auth";
import { redirect } from "next/navigation";

export default async function AccountPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { quota?: string; blocked?: string; verify?: string } }) {
  if (!(await getCustomerSessionForPage())) redirect(`/${params.locale}/sign-in?returnTo=${encodeURIComponent(`/${params.locale}/account`)}`);
  return <CustomerAccount locale={params.locale} blockedReason={searchParams.blocked ?? (searchParams.verify === "email" ? "EMAIL_VERIFICATION_REQUIRED" : searchParams.quota === "reached" ? "SPOT_CHECK_QUOTA_REACHED" : null)} />;
}
