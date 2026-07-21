"use client";

import { AlertCircle, ArrowLeft, ArrowRight, Building2, CalendarDays, CheckCircle2, Clock3, LoaderCircle, Search, TriangleAlert, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type Locale = "en" | "zh";

type PropertyCandidate = {
  externalId: string;
  canonicalName: string;
  address: string;
  city: string;
  countryCode: string;
  accommodationType: string;
  matchStatus: "UNIQUE" | "MULTIPLE" | "NONE" | "CONFLICT";
  isDemo: boolean;
  propertyId: string | null;
  unitIds: string[];
};

type PublicCheck = {
  id: string;
  rawInput: string;
  status: string;
  nextAction: string;
  isDemo: boolean;
  property: null | {
    id: string;
    canonicalName: string;
    city: string;
    units: Array<{
      id: string;
      officialName: string;
      capacity: number;
      bedrooms: number | null;
      unitType: string;
      isDemo: boolean;
    }>;
  };
  unit: null | { id: string; officialName: string; isDemo: boolean };
  stayQuery: null | {
    checkIn: string;
    checkOut: string;
    adults: number;
    children: number;
    units: number;
  };
};

type ApiEnvelope<T> = { data: T; meta?: Record<string, unknown> };
type ApiFailure = { error?: { code?: string; message?: string; referenceId?: string; fieldErrors?: Record<string, string[]> } };

export function CheckStartForm({ locale, initialInput = "" }: { locale: Locale; initialInput?: string }) {
  const t = useTranslations("Check");
  const router = useRouter();
  const dates = useMemo(defaultStayDates, []);
  const idempotencyKey = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<null | "UNSUPPORTED" | "COMING_SOON" | "SOURCE_UNAVAILABLE" | "NO_MATCH">(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    const form = new FormData(event.currentTarget);
    const input = String(form.get("input") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const nextFieldErrors: Record<string, string> = {};

    if (input.length < 3) nextFieldErrors.input = t("fieldErrors.input");
    if (!/^\S+@\S+\.\S+$/.test(email)) nextFieldErrors.email = t("fieldErrors.email");
    if (form.get("serviceConsent") !== "on") nextFieldErrors.serviceConsent = t("fieldErrors.serviceConsent");
    if (Object.keys(nextFieldErrors).length) {
      setFieldErrors(nextFieldErrors);
      setBusy(false);
      return;
    }

    try {
      const searchResult = await requestJson<{
        supportStatus: "SUPPORTED" | "UNSUPPORTED" | "SOURCE_UNAVAILABLE" | "COMING_SOON";
        matchStatus: string;
        candidates: PropertyCandidate[];
      }>("/api/v1/property-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, locale }),
      });

      if (searchResult.supportStatus === "UNSUPPORTED" || searchResult.supportStatus === "COMING_SOON") {
        setNotice(searchResult.supportStatus);
        return;
      }
      if (searchResult.supportStatus === "SOURCE_UNAVAILABLE") {
        setNotice("SOURCE_UNAVAILABLE");
        return;
      }
      if (!searchResult.candidates.length) {
        setNotice("NO_MATCH");
        return;
      }

      const uniqueCandidate = searchResult.candidates.length === 1 ? searchResult.candidates[0] : null;
      const propertyId = uniqueCandidate?.propertyId ?? undefined;
      const unitId = uniqueCandidate?.unitIds.length === 1 ? uniqueCandidate.unitIds[0] : undefined;
      const created = await requestJson<{ checkId: string; status: string; nextAction: string }>("/api/v1/price-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input,
          locale,
          email,
          propertyId,
          unitId,
          stayQuery: {
            checkIn: dates.checkIn,
            checkOut: dates.checkOut,
            adults: 2,
            children: 0,
            units: 1,
            currency: "NZD",
            cancellationCategory: "STANDARD",
            timezone: "Pacific/Auckland",
          },
          serviceConsent: form.get("serviceConsent") === "on",
          marketingConsent: form.get("marketingConsent") === "on",
          idempotencyKey: idempotencyKey.current ?? (idempotencyKey.current = crypto.randomUUID()),
        }),
      });

      const nextStep = !propertyId ? "property" : uniqueCandidate && uniqueCandidate.unitIds.length > 1 ? "unit" : "query";
      router.push(`/${locale}/check/${created.checkId}/${nextStep}`);
    } catch (caught) {
      if (caught instanceof RequestError && caught.fieldErrors) {
        setFieldErrors(Object.fromEntries(Object.entries(caught.fieldErrors).map(([field, messages]) => [field, messages[0]])));
      } else {
        setError(caught instanceof Error ? caught.message : t("genericError"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <FlowPage title={t("startTitle")} intro={t("startIntro")} currentStep={0}>
      <form className="flow-form" onSubmit={submit} noValidate>
        <Field label={t("propertyLabel")} htmlFor="check-input" error={fieldErrors.input}>
          <div className="input-with-icon"><Search size={19} /><input id="check-input" name="input" defaultValue={initialInput} maxLength={500} required autoComplete="off" placeholder={t("propertyPlaceholder")} aria-invalid={Boolean(fieldErrors.input)} aria-describedby={fieldErrors.input ? "check-input-error" : undefined} /></div>
        </Field>
        <Field label={t("emailLabel")} hint={t("emailHint")} htmlFor="check-email" error={fieldErrors.email}>
          <input id="check-email" name="email" type="email" required autoComplete="email" placeholder={t("emailPlaceholder")} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "check-email-error" : undefined} />
        </Field>
        <div><label className="check-control"><input name="serviceConsent" type="checkbox" required aria-invalid={Boolean(fieldErrors.serviceConsent)} aria-describedby={fieldErrors.serviceConsent ? "service-consent-error" : undefined} /><span>{t("serviceConsent")}</span></label>{fieldErrors.serviceConsent ? <p className="field-error" id="service-consent-error">{fieldErrors.serviceConsent}</p> : null}</div>
        <label className="check-control"><input name="marketingConsent" type="checkbox" /><span>{t("marketingConsent")}</span></label>
        {notice ? <FlowNotice tone="warning" title={t(`notice.${notice}.title`)} body={t(`notice.${notice}.body`)} /> : null}
        {error ? <FlowNotice tone="danger" title={t("errorTitle")} body={error} /> : null}
        <button className="button button-primary flow-primary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="spin" size={18} /> : <Search size={18} />}{busy ? t("searching") : t("searchAction")}
        </button>
      </form>
    </FlowPage>
  );
}

export function PropertyConfirmation({ locale, checkId }: { locale: Locale; checkId: string }) {
  const t = useTranslations("Check");
  const router = useRouter();
  const [check, setCheck] = useState<PublicCheck | null>(null);
  const [candidates, setCandidates] = useState<PropertyCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loaded = await requestJson<PublicCheck>(`/api/v1/price-checks/${checkId}`);
        const found = await requestJson<{ candidates: PropertyCandidate[] }>("/api/v1/property-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ input: loaded.rawInput, locale }),
        });
        if (active) {
          setCheck(loaded);
          setCandidates(found.candidates);
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : t("genericError"));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [checkId, locale, t]);

  async function select(candidate: PropertyCandidate) {
    if (!candidate.propertyId) return;
    setLoading(true);
    try {
      await requestJson(`/api/v1/price-checks/${checkId}/confirm-property`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId: candidate.propertyId }),
      });
      router.push(`/${locale}/check/${checkId}/${candidate.unitIds.length > 1 ? "unit" : "query"}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("genericError"));
      setLoading(false);
    }
  }

  return (
    <FlowPage title={t("propertyTitle")} intro={check ? t("propertyIntro", { input: check.rawInput }) : t("loading")} currentStep={0}>
      {loading ? <LoadingState label={t("loadingCandidates")} /> : null}
      {!loading && candidates.length ? <div className="selection-list">{candidates.map((candidate) => (
        <button className="selection-row" type="button" key={candidate.externalId} onClick={() => select(candidate)} disabled={!candidate.propertyId}>
          <Building2 size={22} /><span><strong>{candidate.canonicalName}</strong><small>{candidate.address}</small>{candidate.isDemo ? <em>{t("demoBadge")}</em> : null}</span><ArrowRight size={19} />
        </button>
      ))}</div> : null}
      {!loading && !candidates.length ? <FlowNotice tone="warning" title={t("notice.NO_MATCH.title")} body={t("notice.NO_MATCH.body")} /> : null}
      {error ? <FlowNotice tone="danger" title={t("errorTitle")} body={error} /> : null}
    </FlowPage>
  );
}

export function UnitConfirmation({ locale, checkId }: { locale: Locale; checkId: string }) {
  const t = useTranslations("Check");
  const router = useRouter();
  const { check, loading, error, setError, reload } = usePublicCheck(checkId, t("genericError"));
  const [submitting, setSubmitting] = useState(false);

  async function select(unitId: string) {
    setSubmitting(true);
    try {
      await requestJson(`/api/v1/price-checks/${checkId}/confirm-unit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ unitId }),
      });
      router.push(`/${locale}/check/${checkId}/query`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("genericError"));
      setSubmitting(false);
    }
  }

  return (
    <FlowPage title={t("unitTitle")} intro={check?.property ? t("unitIntro", { property: check.property.canonicalName }) : t("loading")} currentStep={1}>
      {loading ? <LoadingState label={t("loadingUnits")} /> : null}
      {!loading && check?.property?.units.length ? <div className="selection-list">{check.property.units.map((unit) => (
        <button className="selection-row" type="button" key={unit.id} onClick={() => select(unit.id)} disabled={submitting}>
          <Building2 size={22} /><span><strong>{unit.officialName}</strong><small>{t("unitMeta", { capacity: unit.capacity, bedrooms: unit.bedrooms ?? 0 })}</small>{unit.isDemo ? <em>{t("demoBadge")}</em> : null}</span><ArrowRight size={19} />
        </button>
      ))}</div> : null}
      {!loading && !check?.property?.units.length ? <FlowNotice tone="warning" title={t("noUnitsTitle")} body={t("noUnitsBody")} /> : null}
      {error ? <FlowNotice tone="danger" title={t("errorTitle")} body={error} action={<button className="button button-secondary" type="button" onClick={reload}>{t("retry")}</button>} /> : null}
    </FlowPage>
  );
}

export function QueryConfirmation({ locale, checkId }: { locale: Locale; checkId: string }) {
  const t = useTranslations("Check");
  const router = useRouter();
  const dates = useMemo(defaultStayDates, []);
  const { check, loading, error, setError } = usePublicCheck(checkId, t("genericError"));
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/v1/price-checks/${checkId}/confirm-query`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          checkIn: String(form.get("checkIn")),
          checkOut: String(form.get("checkOut")),
          adults: Number(form.get("adults")),
          children: Number(form.get("children")),
          units: 1,
          currency: "NZD",
          cancellationCategory: "STANDARD",
          timezone: "Pacific/Auckland",
        }),
      });
      router.push(`/${locale}/check/${checkId}/status`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("genericError"));
      setSubmitting(false);
    }
  }

  const initialCheckIn = check?.stayQuery?.checkIn?.slice(0, 10) ?? dates.checkIn;
  const initialCheckOut = check?.stayQuery?.checkOut?.slice(0, 10) ?? dates.checkOut;

  return (
    <FlowPage title={t("queryTitle")} intro={check?.unit ? t("queryIntro", { unit: check.unit.officialName }) : t("queryIntroFallback")} currentStep={2}>
      {loading ? <LoadingState label={t("loading")} /> : (
        <form className="flow-form" onSubmit={submit}>
          {check?.isDemo ? <FlowNotice tone="warning" title={t("demoNoticeTitle")} body={t("demoNoticeBody")} /> : null}
          <div className="field-grid"><Field label={t("checkIn")} htmlFor="check-in"><input id="check-in" name="checkIn" type="date" defaultValue={initialCheckIn} required /></Field><Field label={t("checkOut")} htmlFor="check-out"><input id="check-out" name="checkOut" type="date" defaultValue={initialCheckOut} required /></Field></div>
          <div className="field-grid"><Field label={t("adults")} htmlFor="adults"><input id="adults" name="adults" type="number" min="1" max="16" defaultValue={check?.stayQuery?.adults ?? 2} required /></Field><Field label={t("children")} htmlFor="children"><input id="children" name="children" type="number" min="0" max="16" defaultValue={check?.stayQuery?.children ?? 0} required /></Field></div>
          <FlowNotice tone="info" title={t("queryNoticeTitle")} body={t("queryNoticeBody")} />
          {error ? <FlowNotice tone="danger" title={t("errorTitle")} body={error} /> : null}
          <button className="button button-primary flow-primary" type="submit" disabled={submitting}>{submitting ? <LoaderCircle className="spin" size={18} /> : <CalendarDays size={18} />}{submitting ? t("submitting") : t("confirmQuery")}</button>
        </form>
      )}
    </FlowPage>
  );
}

export function CheckStatus({ locale, checkId }: { locale: Locale; checkId: string }) {
  const t = useTranslations("Check");
  const [check, setCheck] = useState<PublicCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const terminal = check ? ["PUBLISHED", "PARTIAL", "INSUFFICIENT_DATA", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "FAILED", "CANCELLED", "EXPIRED", "WITHDRAWN"].includes(check.status) : false;
  const presentation = check ? getStatusPresentation(check.status, terminal) : null;
  const localInboxAction = process.env.NODE_ENV === "development" ? <a className="button button-secondary" href="http://127.0.0.1:8025" target="_blank" rel="noreferrer">{t("openLocalInbox")}</a> : undefined;

  const load = useCallback(async () => {
    try {
      setCheck(await requestJson<PublicCheck>(`/api/v1/price-checks/${checkId}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("genericError"));
    }
  }, [checkId, t]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (!terminal) void load(); }, 2_000);
    return () => window.clearInterval(timer);
  }, [load, terminal]);

  return (
    <FlowPage title={terminal ? t("statusFinishedTitle") : t("statusTitle")} intro={t("statusReference", { checkId })} currentStep={terminal ? 4 : 3}>
      {!check && !error ? <LoadingState label={t("loadingStatus")} /> : null}
      {check?.isDemo ? <FlowNotice tone="warning" title={t("demoNoticeTitle")} body={t("demoNoticeBody")} /> : null}
      {check && presentation ? <div className={`status-panel status-tone-${presentation.tone}`} role="status" aria-live="polite">
        <div className="status-icon">{presentation.icon}</div>
        <div><span>{t("currentStatus")}</span><h2>{t(`status.${check.status}`)}</h2><p>{t(`statusBody.${check.status}`)}</p></div>
      </div> : null}
      {check?.status === "PUBLISHED" ? <FlowNotice tone="success" title={t("resultReadyTitle")} body={t("resultReadyBody")} action={localInboxAction} /> : null}
      {check?.status === "PARTIAL" || check?.status === "INSUFFICIENT_DATA" ? <FlowNotice tone="warning" title={t("limitedTitle")} body={t("limitedBody")} action={localInboxAction} /> : null}
      {error ? <FlowNotice tone="danger" title={t("errorTitle")} body={error} action={<button className="button button-secondary" type="button" onClick={load}>{t("retry")}</button>} /> : null}
      <div className="flow-actions"><Link className="text-link" href={`/${locale}`}><ArrowLeft size={16} />{t("backHome")}</Link>{terminal ? <Link className="button button-secondary" href={`/${locale}/check`}>{t("anotherCheck")}</Link> : null}</div>
    </FlowPage>
  );
}

function usePublicCheck(checkId: string, fallbackMessage: string) {
  const [check, setCheck] = useState<PublicCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setCheck(await requestJson<PublicCheck>(`/api/v1/price-checks/${checkId}`));
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallbackMessage);
    } finally {
      setLoading(false);
    }
  }, [checkId, fallbackMessage]);
  useEffect(() => { void reload(); }, [reload]);
  return { check, loading, error, setError, reload };
}

function FlowPage({ title, intro, currentStep, children }: { title: string; intro: string; currentStep: number; children: React.ReactNode }) {
  return <section className="flow-page"><div className="flow-container"><FlowStepper currentStep={currentStep} /><div className="flow-heading"><h1>{title}</h1><p>{intro}</p></div><div className="flow-surface">{children}</div></div></section>;
}

function FlowStepper({ currentStep }: { currentStep: number }) {
  const t = useTranslations("Check");
  const steps = ["property", "unit", "query", "processing", "result"];

  return <ol className="flow-stepper" aria-label={t("steps.label")}>{steps.map((step, index) => <li className={index < currentStep ? "is-complete" : index === currentStep ? "is-current" : ""} key={step} aria-current={index === currentStep ? "step" : undefined}><span>{index < currentStep ? <CheckCircle2 size={16} /> : index + 1}</span><strong>{t(`steps.${step}`)}</strong></li>)}</ol>;
}

function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string; htmlFor: string; children: React.ReactNode }) {
  return <div className="field"><label htmlFor={htmlFor}>{label}</label>{children}{hint ? <p>{hint}</p> : null}{error ? <p className="field-error" id={`${htmlFor}-error`}>{error}</p> : null}</div>;
}

function LoadingState({ label }: { label: string }) {
  return <div className="loading-state" role="status"><LoaderCircle className="spin" size={24} /><span>{label}</span></div>;
}

function FlowNotice({ tone, title, body, action }: { tone: "info" | "success" | "warning" | "danger"; title: string; body: string; action?: React.ReactNode }) {
  const icon = tone === "success" ? <CheckCircle2 size={20} /> : tone === "danger" ? <XCircle size={20} /> : tone === "warning" ? <TriangleAlert size={20} /> : <AlertCircle size={20} />;
  return <div className={`flow-notice notice-${tone}`} role={tone === "danger" ? "alert" : "status"}>{icon}<div><strong>{title}</strong><p>{body}</p>{action}</div></div>;
}

function getStatusPresentation(status: string, terminal: boolean) {
  if (status === "PUBLISHED") return { tone: "success", icon: <CheckCircle2 size={28} /> };
  if (["PARTIAL", "INSUFFICIENT_DATA", "UNSUPPORTED", "SOURCE_UNAVAILABLE", "EXCEPTION"].includes(status)) return { tone: "warning", icon: <TriangleAlert size={28} /> };
  if (["FAILED", "CANCELLED", "EXPIRED", "WITHDRAWN"].includes(status)) return { tone: "danger", icon: <XCircle size={28} /> };
  if (terminal) return { tone: "success", icon: <CheckCircle2 size={28} /> };
  return { tone: "info", icon: status === "QUEUED" ? <Clock3 size={28} /> : <LoaderCircle className="spin" size={28} /> };
}

class RequestError extends Error {
  fieldErrors?: Record<string, string[]>;

  constructor(message: string, fieldErrors?: Record<string, string[]>) {
    super(message);
    this.name = "RequestError";
    this.fieldErrors = fieldErrors;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, cache: "no-store" });
  const payload = await response.json() as ApiEnvelope<T> & ApiFailure;
  if (!response.ok || payload.error) {
    const fieldMessage = payload.error?.fieldErrors ? Object.values(payload.error.fieldErrors).flat()[0] : undefined;
    throw new RequestError(fieldMessage ?? payload.error?.message ?? `Request failed (${response.status})`, payload.error?.fieldErrors);
  }
  return payload.data;
}

function defaultStayDates() {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + 7);
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1);
  return { checkIn: localDate(checkIn), checkOut: localDate(checkOut) };
}

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
