"use client";

import { CheckCircle2, LoaderCircle, Mail, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { FormEvent, useState } from "react";

type Locale = "en" | "zh";

export function WaitlistForm({ locale, initialInput = "" }: { locale: Locale; initialInput?: string }) {
  const t = useTranslations("Forms");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        locale,
        country: form.get("country"),
        market: form.get("market") || undefined,
        input: form.get("input") || undefined,
        marketingConsent: form.get("marketingConsent") === "on",
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    setState(response.ok ? "sent" : "error");
  }

  if (state === "sent") return <SuccessState title={t("waitlistSuccessTitle")} body={t("waitlistSuccessBody")} />;
  return (
    <form className="flow-form" onSubmit={submit}>
      <Field label={t("email")} htmlFor="waitlist-email"><input id="waitlist-email" name="email" type="email" required autoComplete="email" /></Field>
      <div className="field-grid"><Field label={t("country")} htmlFor="waitlist-country"><input id="waitlist-country" name="country" defaultValue="New Zealand" minLength={2} maxLength={80} required /></Field><Field label={t("market")} htmlFor="waitlist-market"><input id="waitlist-market" name="market" maxLength={120} placeholder={t("marketPlaceholder")} /></Field></div>
      <Field label={t("propertyOptional")} htmlFor="waitlist-input"><input id="waitlist-input" name="input" defaultValue={initialInput} maxLength={500} /></Field>
      <label className="check-control"><input name="marketingConsent" type="checkbox" /><span>{t("marketingConsent")}</span></label>
      {state === "error" ? <p className="form-error" role="alert">{t("submitError")}</p> : null}
      <button className="button button-primary flow-primary" type="submit" disabled={state === "sending"}>{state === "sending" ? <LoaderCircle className="spin" size={18} /> : <Mail size={18} />}{t("joinWaitlist")}</button>
    </form>
  );
}

export function ContactForm({ locale }: { locale: Locale }) {
  const t = useTranslations("Forms");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [referenceId, setReferenceId] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/v1/contact", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        email: form.get("email"),
        topic: form.get("topic"),
        message: form.get("message"),
        checkId: form.get("checkId") || undefined,
        locale,
      }),
    });
    if (response.ok) {
      const payload = await response.json() as { data: { referenceId: string } };
      setReferenceId(payload.data.referenceId);
      setState("sent");
    } else {
      setState("error");
    }
  }

  if (state === "sent") return <SuccessState title={t("contactSuccessTitle")} body={t("contactSuccessBody", { referenceId })} />;
  return (
    <form className="flow-form" onSubmit={submit}>
      <div className="field-grid"><Field label={t("name")} htmlFor="contact-name"><input id="contact-name" name="name" minLength={2} maxLength={120} required autoComplete="name" /></Field><Field label={t("email")} htmlFor="contact-email"><input id="contact-email" name="email" type="email" required autoComplete="email" /></Field></div>
      <Field label={t("topic")} htmlFor="contact-topic"><select id="contact-topic" name="topic" required><option value="Product question">{t("topicProduct")}</option><option value="Price Check support">{t("topicCheck")}</option><option value="Privacy or data deletion">{t("topicPrivacy")}</option><option value="Data provider enquiry">{t("topicProvider")}</option></select></Field>
      <Field label={t("checkReferenceOptional")} htmlFor="contact-check"><input id="contact-check" name="checkId" maxLength={120} /></Field>
      <Field label={t("message")} htmlFor="contact-message"><textarea id="contact-message" name="message" minLength={10} maxLength={5_000} required rows={7} /></Field>
      {state === "error" ? <p className="form-error" role="alert">{t("submitError")}</p> : null}
      <button className="button button-primary flow-primary" type="submit" disabled={state === "sending"}>{state === "sending" ? <LoaderCircle className="spin" size={18} /> : <Send size={18} />}{t("sendMessage")}</button>
    </form>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="field"><label htmlFor={htmlFor}>{label}</label>{children}</div>;
}

function SuccessState({ title, body }: { title: string; body: string }) {
  return <div className="form-success" role="status"><CheckCircle2 size={30} /><h2>{title}</h2><p>{body}</p></div>;
}
