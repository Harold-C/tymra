import { decryptPersonalData } from "@tymra/db";
import { CheckStartForm } from "@/components/public/PriceCheckFlow";
import { getCustomerSessionForPage } from "@/lib/server/customer-auth";

export default async function AddressCheckPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { input?: string } }) {
  const session = await getCustomerSessionForPage();
  const memberEmail = session ? decryptPersonalData(session.customerUser.encryptedEmail, process.env.DATA_ENCRYPTION_KEY!) : undefined;
  return <CheckStartForm locale={params.locale} initialInput={searchParams.input ?? ""} memberEmail={memberEmail} />;
}
