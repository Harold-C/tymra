import { decryptPersonalData } from "@tymra/db";
import { CheckStartForm } from "@/components/public/PriceCheckFlow";
import { PublicShell } from "@/components/public/PublicShell";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";

export default async function AddressCheckPage({ params, searchParams }: { params: { locale: "en" | "zh" }; searchParams: { input?: string } }) {
  const session = await getCustomerSessionForPage();
  const memberEmail = session ? decryptPersonalData(session.customerUser.encryptedEmail, process.env.DATA_ENCRYPTION_KEY!) : undefined;
  return (
    <PublicShell locale={params.locale}>
      <CheckStartForm locale={params.locale} initialInput={searchParams.input ?? ""} memberEmail={memberEmail} />
    </PublicShell>
  );
}
