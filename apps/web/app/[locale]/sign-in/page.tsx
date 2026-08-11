import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MemberSignInForm } from "@/components/member/MemberSignInForm";
import { PublicShell } from "@/components/public/PublicShell";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MemberSignInPage({
  params,
  searchParams,
}: {
  params: { locale: "en" | "zh" };
  searchParams: { returnTo?: string };
}) {
  const safeReturnTo = typeof searchParams.returnTo === "string" && /^\/(en|zh)\/account(?:[/?]|$)/.test(searchParams.returnTo)
    ? searchParams.returnTo
    : undefined;
  if (await getCustomerSessionForPage()) redirect(safeReturnTo ?? `/${params.locale}/account`);
  return <PublicShell locale={params.locale}><div className="member-signin-page"><MemberSignInForm locale={params.locale} returnTo={safeReturnTo} /></div></PublicShell>;
}
