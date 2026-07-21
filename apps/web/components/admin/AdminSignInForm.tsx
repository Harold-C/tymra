"use client";

import { LoaderCircle, LockKeyhole } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { adminText, type AdminLocale } from "@/lib/admin-i18n";

type AdminSignInFormProps = {
  locale: AdminLocale;
  defaultEmail?: string;
  defaultPassword?: string;
};

export function AdminSignInForm({ locale, defaultEmail, defaultPassword }: AdminSignInFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/admin/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
    if (response.ok) {
      router.replace("/admin/exceptions");
      router.refresh();
      return;
    }
    const payload = await response.json() as { error?: { message?: string } };
    setError(payload.error?.message ?? adminText(locale, "signInFailed"));
    setBusy(false);
  }
  return <form className="admin-signin-form" onSubmit={submit}><div className="field"><label htmlFor="admin-email">{adminText(locale, "email")}</label><input id="admin-email" name="email" type="email" autoComplete="username" defaultValue={defaultEmail} required /></div><div className="field"><label htmlFor="admin-password">{adminText(locale, "password")}</label><input id="admin-password" name="password" type="password" autoComplete="current-password" defaultValue={defaultPassword} minLength={defaultPassword ? 6 : 8} required /></div>{error ? <p className="form-error" role="alert">{error}</p> : null}<button className="button button-primary" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <LockKeyhole size={18} />}{adminText(locale, busy ? "signingIn" : "signIn")}</button></form>;
}
