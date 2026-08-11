import { CustomerCheckExperience } from "@/components/member/CustomerAccountViews";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { redirect } from "next/navigation";

export default async function CustomerCheckPage({ params }: { params: { locale: "en" | "zh"; checkId: string } }) {
  if (!(await getCustomerSessionForPage())) {
    const returnTo = `/${params.locale}/account/checks/${params.checkId}`;
    redirect(`/${params.locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return <CustomerCheckExperience locale={params.locale} checkId={params.checkId} />;
}
