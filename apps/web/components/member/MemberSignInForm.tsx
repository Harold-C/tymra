"use client";

import { LoaderCircle, LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ApiPayload = { data?: { returnTo: string }; error?: { message?: string } };

export function MemberSignInForm({ locale, returnTo }: { locale: "en" | "zh"; returnTo?: string }) {
  const copy = useTranslations("MembershipAuth");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/customer/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "").trim(), password: String(form.get("password") ?? ""), returnTo }),
      });
      const payload = await response.json() as ApiPayload;
      if (!response.ok || !payload.data?.returnTo) throw new Error(payload.error?.message ?? copy("error"));
      router.push(payload.data.returnTo);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : copy("error"));
    } finally {
      setBusy(false);
    }
  }

  return <section className="member-signin-card" aria-labelledby="member-signin-heading">
    <span className="rough-eyebrow"><LogIn aria-hidden="true" />{copy("eyebrow")}</span>
    <h1 id="member-signin-heading">{copy("title")}</h1>
    <p>{copy("intro")}</p>
    <form onSubmit={submit}>
      <label htmlFor="member-email">{copy("emailLabel")}</label>
      <input id="member-email" name="email" type="email" autoComplete="username" placeholder={copy("emailPlaceholder")} required />
      <label htmlFor="member-password">{copy("passwordLabel")}</label>
      <input id="member-password" name="password" type="password" autoComplete="current-password" minLength={12} maxLength={200} required />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <LogIn aria-hidden="true" />}{copy(busy ? "signingIn" : "submit")}</button>
    </form>
    <p className="member-signin-secondary">{copy("noAccount")} <Link href={`/${locale}/sign-up`}>{copy("createAccount")}</Link></p>
    <div className="member-signin-links"><Link href={`/${locale}`}>{copy("back")}</Link><Link href={`/${locale}/privacy`}>{copy("privacy")}</Link></div>
  </section>;
}
