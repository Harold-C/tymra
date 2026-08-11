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
  const developmentCredentials = process.env.NODE_ENV === "development"
    ? { email: process.env.MEMBER_DEV_EMAIL, password: process.env.MEMBER_DEV_PASSWORD }
    : {};
  return <PublicShell locale={params.locale}><div className="member-signin-page"><MemberSignInForm locale={params.locale} returnTo={safeReturnTo} defaultEmail={developmentCredentials.email} defaultPassword={developmentCredentials.password} /></div></PublicShell>;
}
