import { PublicShell } from "@/components/public/PublicShell";
import { CustomerAccountNav } from "@/components/member/CustomerAccountNav";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: { locale: "en" | "zh" } }) {
  const session = await getCustomerSessionForPage();
  if (!session) {
    const requested = headers().get("x-tymra-return-to");
    const returnTo = requested && new RegExp(`^/${params.locale}/account(?:[/?]|$)`, "u").test(requested) ? requested : `/${params.locale}/account`;
    redirect(`/${params.locale}/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return <PublicShell locale={params.locale}><CustomerAccountNav locale={params.locale} plan={session.customerUser.membership?.plan ?? "FREE"} />{children}</PublicShell>;
}
