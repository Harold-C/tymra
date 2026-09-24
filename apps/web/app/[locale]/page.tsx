import { TymraHomePage } from "@/components/home/TymraHomePage";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { getEnvironment } from "@tymra/config";

export const dynamic = "force-dynamic";

export default async function LocaleHome() {
  const customerSession = await getCustomerSessionForPage();
  return <TymraHomePage signedIn={Boolean(customerSession)} discoveryHidden={getEnvironment().CLIENT_DISCOVERY_MODE === "DEPLOYED_HIDDEN"} />;
}
