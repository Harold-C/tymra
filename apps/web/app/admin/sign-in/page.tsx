import { redirect } from "next/navigation";

import { AdminSignInForm } from "@/components/admin/AdminSignInForm";
import { AdminLanguageSwitch } from "@/components/admin/AdminLanguageSwitch";
import { adminText } from "@/lib/admin-i18n";
import { getAdminForPage } from "@/lib/server/admin-auth";
import { getAdminLocale } from "@/lib/server/admin-locale";

export default async function AdminSignInPage() {
  if (await getAdminForPage()) redirect("/admin/exceptions");
  const developmentCredentials = process.env.NODE_ENV === "development"
    ? { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_DEV_PASSWORD }
    : {};
  const locale = getAdminLocale();
  return <main className="admin-signin-page"><section><div className="admin-signin-toolbar"><div className="admin-signin-brand">Tymra <span>{adminText(locale, "operations")}</span></div><AdminLanguageSwitch locale={locale} /></div><h1>{adminText(locale, "signIn")}</h1><p>{adminText(locale, "signInIntro")}</p><AdminSignInForm locale={locale} defaultEmail={developmentCredentials.email} defaultPassword={developmentCredentials.password} /></section></main>;
}
