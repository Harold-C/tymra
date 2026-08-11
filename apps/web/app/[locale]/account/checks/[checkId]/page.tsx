import { CustomerCheckExperience } from "@/components/member/CustomerAccountViews";
import { getAccountMetadata } from "@/lib/account-metadata";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { redirect } from "next/navigation";

export function generateMetadata({ params }: { params: { locale: "en" | "zh" } }) { return getAccountMetadata(params.locale, "checkDetail"); }

export default async function CustomerCheckPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  if (!(await getCustomerSessionForPage())) {
    const returnTo = `/${params.locale}/account/checks/${params.checkId}`;
    redirect(`/${params.locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return <CustomerCheckExperience locale={params.locale} checkId={params.checkId} />;
}
