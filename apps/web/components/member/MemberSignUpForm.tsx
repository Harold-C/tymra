"use client";

import { LoaderCircle, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type ApiPayload = { data?: { returnTo: string }; error?: { message?: string } };

export function MemberSignUpForm({ locale }: { locale: "en" | "zh" }) {
  const copy = useTranslations("MembershipRegistration");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    if (password !== String(form.get("confirmPassword") ?? "")) return setError(copy("passwordMismatch"));
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/customer/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: String(form.get("email") ?? "").trim(), password, locale, serviceConsent: form.get("serviceConsent") === "on" }),
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

  return <section className="member-signin-card" aria-labelledby="member-signup-heading">
    <span className="rough-eyebrow"><UserPlus aria-hidden="true" />{copy("eyebrow")}</span>
    <h1 id="member-signup-heading">{copy("title")}</h1>
    <p>{copy("intro")}</p>
    <form onSubmit={submit}>
      <label htmlFor="register-email">{copy("emailLabel")}</label>
      <input id="register-email" name="email" type="email" autoComplete="username" required />
      <label htmlFor="register-password">{copy("passwordLabel")}</label>
      <input id="register-password" name="password" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
      <p className="field-hint">{copy("passwordHint")}</p>
      <label htmlFor="register-password-confirm">{copy("confirmPasswordLabel")}</label>
      <input id="register-password-confirm" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={200} required />
      <label className="member-consent"><input name="serviceConsent" type="checkbox" required /><span>{copy("serviceConsent")}</span></label>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}{copy(busy ? "creating" : "submit")}</button>
    </form>
    <p className="member-signin-secondary">{copy("hasAccount")} <Link href={`/${locale}/sign-in`}>{copy("signIn")}</Link></p>
  </section>;
}
