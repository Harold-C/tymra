import { TymraHomePage } from "@/components/home/TymraHomePage";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";

export const dynamic = "force-dynamic";

export default async function LocaleHome() {
  const customerSession = await getCustomerSessionForPage();
  return <TymraHomePage signedIn={Boolean(customerSession)} />;
}
