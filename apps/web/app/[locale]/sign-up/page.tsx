import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { MemberSignUpForm } from "@/components/member/MemberSignUpForm";
import { PublicShell } from "@/components/public/PublicShell";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function MemberSignUpPage({ params }: { params: { locale: "en" | "zh" } }) {
  if (await getCustomerSessionForPage()) redirect(`/${params.locale}/account`);
  return <PublicShell locale={params.locale}><div className="member-signin-page"><MemberSignUpForm locale={params.locale} /></div></PublicShell>;
}
