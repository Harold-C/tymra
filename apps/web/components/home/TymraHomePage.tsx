"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useRef, useState } from "react";
import type React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  LoaderCircle,
  MoveHorizontal,
  Search,
  X,
} from "lucide-react";
import clsx from "clsx";
import { SiteHeader } from "@/components/public/SiteHeader";
import { QuantumWaveCanvas } from "./QuantumWaveCanvas";
import { badgeIcon as BadgeIcon, footerIcon as FooterIcon, homeCopy, iconToneClass } from "../../lib/home-content";
import type { HomeCopy, Locale } from "../../lib/home-content";
import { getInputType, validateHomeInput } from "../../lib/home-validation";
import type { ValidationCode } from "../../lib/home-validation";
import { trackEvent } from "../../lib/analytics";

type SearchState =
  | { status: "idle"; value: string }
  | { status: "typing"; value: string }
  | { status: "submitting"; value: string }
  | { status: "challenge"; value: string; challenge: { mode: "deterministic" | "managed"; token?: string; siteKey?: string } }
  | { status: "validationError"; value: string; error: { code: ValidationCode; message: string } };

type DeviceType = "desktop" | "mobile";

function getLocaleFromPath(pathname: string | null): Locale {
  return pathname?.startsWith("/zh") ? "zh" : "en";
}

function getDeviceType(): DeviceType {
  if (typeof window === "undefined") return "desktop";
  return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
}

export function TymraHomePage({ signedIn = false }: { signedIn?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = getLocaleFromPath(pathname);
  const t = homeCopy[locale];
  const reduceMotion = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const inputStarted = useRef(false);
  const roughRequestKey = useRef<string | null>(null);
  const [searchState, setSearchState] = useState<SearchState>({ status: "idle", value: "" });
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openFooterGroup, setOpenFooterGroup] = useState<string | null>(null);

  const value = searchState.value;

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    trackEvent({ name: "homepage_viewed", properties: { locale, deviceType: getDeviceType() } });
  }, [locale]);

  function updateValue(nextValue: string) {
    roughRequestKey.current = null;
    if (!inputStarted.current && nextValue.trim()) {
      inputStarted.current = true;
      trackEvent({ name: "input_started", properties: { locale, inputType: getInputType(nextValue), deviceType: getDeviceType() } });
    }

    setSearchState(nextValue.trim() ? { status: "typing", value: nextValue } : { status: "idle", value: nextValue });
  }

  function clearSearch() {
    inputStarted.current = false;
    roughRequestKey.current = null;
    setSearchState({ status: "idle", value: "" });
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function submitSearch(event?: FormEvent) {
    event?.preventDefault();
    const submittedValue = inputRef.current?.value ?? value;
    const challengeToken = searchState.status === "challenge" ? searchState.challenge.token : undefined;
    const result = validateHomeInput(submittedValue, locale);

    if (!result.ok) {
      trackEvent({
        name: "property_search_submitted",
        properties: {
          locale,
          inputType: result.inputType,
          validationCode: result.code,
          deviceType: getDeviceType(),
        },
      });

      setSearchState({
        status: "validationError",
        value: submittedValue,
        error: { code: result.code, message: result.message },
      });
      return;
    }

    trackEvent({ name: "property_search_submitted", properties: { locale, inputType: result.inputType, deviceType: getDeviceType() } });
    const normalizedInput = /^https?:\/\//i.test(submittedValue.trim()) ? submittedValue.trim() : `https://${submittedValue.trim()}`;
    setSearchState({ status: "submitting", value: submittedValue });
    try {
      const response = await fetch("/api/v1/rough-checks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          input: normalizedInput,
          locale,
          idempotencyKey: roughRequestKey.current ?? (roughRequestKey.current = crypto.randomUUID()),
          ...(challengeToken ? { challengeToken } : {}),
        }),
      });
      const payload = await response.json() as { data?: { id: string }; error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]>; details?: { challenge?: { mode: "deterministic" | "managed"; token?: string; siteKey?: string } } } };
      if (!response.ok || !payload.data) {
        const challenge = payload.error?.details?.challenge;
        if (payload.error?.code === "ROUGH_CHECK_CHALLENGE_REQUIRED" && challenge) {
          setSearchState({ status: "challenge", value: submittedValue, challenge });
          return;
        }
        const message = payload.error?.fieldErrors?.input?.[0]
          ?? payload.error?.message
          ?? (locale === "zh" ? "暂时无法检查这个房源链接，请稍后重试。" : "This listing could not be checked. Please try again.");
        setSearchState({ status: "validationError", value: submittedValue, error: { code: "unsupportedUrl", message } });
        return;
      }
      router.push(`/${locale}/rough/${payload.data.id}`);
    } catch {
      setSearchState({
        status: "validationError",
        value: submittedValue,
        error: {
          code: "unsupportedUrl",
          message: locale === "zh" ? "暂时无法连接到检查服务，请稍后重试。" : "The check service is temporarily unavailable. Please try again.",
        },
      });
    }
  }

  function focusSearchFromHeader() {
    inputRef.current?.focus();
    inputRef.current?.scrollIntoView({ block: "center", behavior: reduceMotion ? "auto" : "smooth" });
  }

  function toggleFaq(index: number) {
    const nextOpen = openFaq === index ? null : index;
    setOpenFaq(nextOpen);
  }

  return (
    <>
      <a href="#main-content" className="skip-link">{locale === "zh" ? "跳到主要内容" : "Skip to main content"}</a>
      <SiteHeader
        copy={t.nav}
        locale={locale}
        signedIn={signedIn}
        onPrimaryAction={focusSearchFromHeader}
      />

      <main
        id="main-content"
        className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_50%_10%,rgba(37,99,235,0.055),transparent_36%),radial-gradient(circle_at_86%_28%,rgba(124,58,237,0.045),transparent_30%),linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_58%,#FFFFFF_100%)] text-[#0B1F3A]"
      >
        <HeroSection
          copy={t}
          locale={locale}
          searchState={searchState}
          value={value}
          inputRef={inputRef}
          onValueChange={updateValue}
          onClear={clearSearch}
          onSubmit={submitSearch}
        />

        <PendingInsightSection copy={t} />
        <ProcessSection copy={t} />
        <ReleaseContextSection copy={t} locale={locale} />
        <FAQSection copy={t} openFaq={openFaq} onToggle={toggleFaq} />
        <FinalCTA copy={t} locale={locale} />
      </main>
      <Footer copy={t} locale={locale} openGroup={openFooterGroup} onGroupChange={setOpenFooterGroup} />
    </>
  );
}

function TymraLogo({ locale, footer = false }: { locale: Locale; footer?: boolean }) {
  const logo = (
    <img
      src="/tymra-logo.png"
      alt="Tymra by Synix"
      className={clsx("h-auto object-contain", footer ? "w-[148px]" : "w-[152px] max-lg:w-[136px]")}
      width={1061}
      height={368}
    />
  );

  if (footer) {
    return (
      <a
        aria-label="Tymra by Synix"
        href={`/${locale}`}
        className="inline-flex rounded-[12px] bg-white px-3 py-2 shadow-[0_10px_28px_rgba(0,0,0,0.12)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        {logo}
      </a>
    );
  }

  return (
    <a aria-label="Tymra by Synix" className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]" href={`/${locale}`}>
      {logo}
    </a>
  );
}

function HeroSection({
  copy: t,
  locale,
  searchState,
  value,
  inputRef,
  onValueChange,
  onClear,
  onSubmit,
}: {
  copy: HomeCopy;
  locale: Locale;
  searchState: SearchState;
  value: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onValueChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (event?: FormEvent) => void;
}) {
  const isZh = locale === "zh";

  return (
    <section className="relative z-10 mx-auto w-full max-w-[1440px] px-5 pb-4 pt-3 md:px-[30px] lg:pt-5 2xl:max-w-[1720px]">
      <SignalLandscape />

      <div className="relative z-10 mx-auto flex max-w-[1020px] flex-col items-center text-center max-md:items-start max-md:text-left">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex max-w-full items-center gap-3 rounded-full border border-[#91C4FF] bg-white/78 px-5 py-2.5 text-[0.83rem] font-bold uppercase tracking-[0.065em] text-[#0969FF] shadow-[0_8px_26px_rgba(37,99,235,0.08)] backdrop-blur-xl max-md:mt-1 max-md:px-3 max-md:py-2 max-md:text-[0.66rem] max-md:tracking-[0.035em]"
        >
          <BadgeIcon className="h-[18px] w-[18px]" strokeWidth={2.2} aria-hidden="true" />
          <span className="min-w-0">{t.hero.badge}</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
          className={clsx(
            "mt-7 max-w-[920px] text-[clamp(3.8rem,4.78vw,4.85rem)] font-extrabold leading-[1.04] tracking-normal text-[#071A3D] max-md:mt-6 max-md:max-w-[650px] max-md:text-[clamp(2.35rem,10.5vw,2.75rem)] max-md:leading-[1.12]",
            isZh && "max-w-[840px] text-[clamp(3.55rem,4.55vw,4.55rem)] max-md:text-[2.25rem] max-md:leading-[1.1] max-md:tracking-[-0.018em]",
          )}
        >
          {isZh ? (
            <>
              <span className="block max-md:whitespace-nowrap">{t.hero.titlePrefix}</span>
              <span className="block bg-[linear-gradient(92deg,#2563EB_0%,#0969FF_42%,#06B6D4_100%)] bg-clip-text text-transparent">
                {t.hero.titleAccent}
              </span>
            </>
          ) : (
            <>
              <span className="block">How much revenue</span>
              <span className="block">
                are you{" "}
                <span className="bg-[linear-gradient(92deg,#2563EB_0%,#0969FF_42%,#06B6D4_100%)] bg-clip-text text-transparent">
                  leaving?
                </span>
              </span>
            </>
          )}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: 0.16 }}
          className="mt-4 max-w-[600px] text-[1.1rem] font-medium leading-[1.65] text-[#26385E] max-md:mt-4 max-md:text-[1rem] max-md:leading-[1.64]"
        >
          {t.hero.subtitle}
        </motion.p>
      </div>

      <SearchCard
        copy={t}
        locale={locale}
        state={searchState}
        value={value}
        inputRef={inputRef}
        onValueChange={onValueChange}
        onClear={onClear}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function SignalLandscape() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[calc(50%-50vw)] top-[150px] z-0 h-[610px] overflow-hidden opacity-95 max-md:top-[172px] max-md:h-[620px]"
    >
      <QuantumWaveCanvas className="absolute inset-y-0 left-1/2 h-full w-[110vw] max-w-none -translate-x-1/2 opacity-100" />
    </div>
  );
}

function SearchCard({
  copy: t,
  locale,
  state,
  value,
  inputRef,
  onValueChange,
  onClear,
  onSubmit,
}: {
  copy: HomeCopy;
  locale: Locale;
  state: SearchState;
  value: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onValueChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (event?: FormEvent) => void;
}) {
  const hasValidationError = state.status === "validationError";
  const requiresChallenge = state.status === "challenge";
  const submitting = state.status === "submitting";

  return (
    <form
      id="price-check-search-card"
      onSubmit={onSubmit}
      className={clsx(
        "relative z-10 mx-auto mt-[58px] w-full max-w-[1200px] rounded-[31px] bg-[linear-gradient(115deg,rgba(80,204,255,0.92)_0%,rgba(255,255,255,0.98)_47%,rgba(124,88,255,0.78)_100%)] p-[1.5px] shadow-[0_24px_72px_rgba(37,99,235,0.18),0_0_44px_rgba(56,189,248,0.16)] max-md:mt-8 max-md:rounded-[29px] 2xl:max-w-[1320px]",
        hasValidationError && "bg-[linear-gradient(90deg,rgba(220,38,38,0.55),rgba(255,255,255,0.78),rgba(37,99,235,0.72))]",
      )}
    >
      <div className="relative overflow-hidden rounded-[29px] border border-white/90 bg-[linear-gradient(112deg,rgba(228,246,255,0.86)_0%,rgba(249,252,255,0.82)_49%,rgba(239,235,255,0.82)_100%)] px-8 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,1),inset_0_-1px_0_rgba(148,163,255,0.16)] backdrop-blur-[24px] max-md:rounded-[27px] max-md:px-5 max-md:py-5">
        <div className="pointer-events-none absolute -left-20 -top-24 h-72 w-72 rounded-full bg-[#7DD3FC]/18 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 right-[-5%] h-72 w-72 rounded-full bg-[#A78BFA]/14 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.98),transparent)]" />
        <div className="relative z-10 flex items-center gap-6 max-[860px]:flex-col max-[860px]:items-stretch max-[860px]:gap-4">
          <label className="group relative flex min-h-[70px] flex-1 items-center gap-5 rounded-[18px] max-md:min-h-[76px] max-md:gap-3">
            <span className="sr-only">{t.search.label}</span>
            <span
              className={clsx(
                "relative flex h-[60px] w-[60px] flex-none items-center justify-center text-[#071A3D] group-focus-within:text-[#0969FF] max-md:h-[54px] max-md:w-[54px]",
                state.status === "typing" && "text-[#0969FF]",
              )}
            >
              <span
                aria-hidden="true"
                className={clsx(
                  "absolute inset-0 rounded-full border border-white/70 bg-[radial-gradient(circle,rgba(255,255,255,0.98)_0%,rgba(219,245,255,0.7)_44%,rgba(56,189,248,0.12)_68%,transparent_74%)] opacity-55 shadow-[0_0_18px_rgba(56,189,248,0.2)]",
                  hasValidationError && "border-red-200/80 shadow-[0_0_24px_rgba(220,38,38,0.2)]",
                )}
              />
              <Search className="relative z-10 h-10 w-10 max-md:h-8 max-md:w-8" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <input
              id="home-property-search"
              ref={inputRef}
              value={value}
              onFocus={() => {
                trackEvent({ name: "search_focused", properties: { locale, inputType: getInputType(value), deviceType: getDeviceType() } });
              }}
              onChange={(event) => onValueChange(event.target.value)}
              disabled={submitting}
              aria-describedby={hasValidationError ? "home-search-error home-search-support" : "home-search-support"}
              aria-invalid={hasValidationError}
              placeholder={t.search.placeholder}
              className="h-[58px] min-w-0 flex-1 bg-transparent text-[1.13rem] font-semibold text-[#1E3A65] outline-none placeholder:font-medium placeholder:text-[#536B91] focus-visible:outline-none focus-visible:shadow-none max-md:h-auto max-md:text-[1rem] max-md:leading-[1.45] max-md:placeholder:text-transparent"
            />
            {!value ? (
              <span aria-hidden="true" className="pointer-events-none absolute left-[66px] right-2 hidden truncate text-[0.95rem] font-medium text-[#536B91] max-md:block">
                {t.search.mobilePlaceholder}
              </span>
            ) : null}
            {value ? (
              <button
                type="button"
                aria-label={t.search.clear}
                onClick={onClear}
                className="mr-1 flex h-11 w-11 flex-none items-center justify-center rounded-full border border-transparent text-[#60708A] transition hover:border-white/90 hover:bg-white/65 hover:text-[#0969FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            ) : null}
          </label>

          <div className="h-[70px] w-px bg-[linear-gradient(180deg,transparent,rgba(141,170,211,0.72),transparent)] max-[860px]:h-px max-[860px]:w-full max-[860px]:bg-[linear-gradient(90deg,transparent,rgba(141,170,211,0.62),transparent)]" />

          <button
            type="submit"
            disabled={submitting}
            className="group inline-flex h-[66px] min-w-[250px] items-center justify-center gap-3 rounded-[16px] border border-white/70 bg-[linear-gradient(102deg,#1478FF_0%,#2563EB_54%,#5B4FE9_100%)] px-6 text-[1.02rem] font-bold text-white shadow-[0_15px_34px_rgba(37,99,235,0.26),inset_0_1px_0_rgba(255,255,255,0.3)] transition duration-250 hover:-translate-y-0.5 hover:shadow-[0_19px_42px_rgba(37,99,235,0.32),inset_0_1px_0_rgba(255,255,255,0.36)] disabled:cursor-wait disabled:opacity-75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] max-[860px]:min-w-0 max-[860px]:w-full"
          >
            {submitting ? <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
            {submitting ? t.search.working : requiresChallenge ? (locale === "zh" ? "完成验证并继续" : "Complete verification") : t.search.cta}
            {!submitting ? <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" /> : null}
          </button>
        </div>

        <div className="relative mt-5 h-px w-full bg-[linear-gradient(90deg,transparent,rgba(147,173,211,0.68)_8%,rgba(255,255,255,0.92)_50%,rgba(147,173,211,0.68)_92%,transparent)] max-[860px]:mt-4" />

        <div className="relative">
          <SearchSupportingInfo copy={t} />
          <p className="mt-3 text-center text-[0.84rem] font-semibold text-[#41506B]">
            <Link
              className="text-[#0969FF] underline decoration-[#93C5FD] underline-offset-4 transition hover:text-[#0758D2] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
              href={`/${locale}/address-check`}
            >
              {t.search.addressCta}
            </Link>
          </p>
        </div>

        <div id="home-search-support" className="sr-only">
          {t.search.facts.map((fact) => fact.text).join(". ")}
        </div>

        <div className="relative mt-2 min-h-4" aria-live="polite" aria-atomic="true">
          {hasValidationError ? (
            <p id="home-search-error" className="inline-flex items-start gap-2 text-[0.92rem] font-semibold text-[#B91C1C]">
              <CircleAlert className="mt-0.5 h-4 w-4 flex-none" aria-hidden="true" />
              {state.error.message}
            </p>
          ) : null}
          {requiresChallenge ? (
            <div className="rounded-xl border border-[#93C5FD] bg-[#EFF6FF] px-4 py-3 text-left text-[0.92rem] text-[#1E3A8A]" data-testid="rough-check-challenge">
              <strong className="block">{locale === "zh" ? "需要额外验证" : "Additional verification required"}</strong>
              <span>{state.challenge.mode === "deterministic"
                ? (locale === "zh" ? "这是本地确定性验证。点击上方按钮即可继续。" : "This is the local deterministic check. Use the button above to continue.")
                : (locale === "zh" ? "请在验证服务中完成检查，然后重试。" : "Complete the managed verification, then retry this request.")}</span>
            </div>
          ) : null}
        </div>
      </div>
    </form>
  );
}

function SearchSupportingInfo({ copy: t }: { copy: HomeCopy }) {
  return (
    <ul className="mt-5 grid grid-cols-4 gap-0 text-[0.8rem] font-semibold text-[#28456F] max-[860px]:grid-cols-2 max-[860px]:gap-y-0 max-md:text-[0.76rem]">
      {t.search.facts.map((fact, index) => {
        const Icon = fact.icon;
        return (
          <li
            key={fact.text}
            className={clsx(
              "relative flex min-h-9 items-center justify-center gap-2.5 px-4 max-[860px]:justify-start max-[860px]:px-3 max-md:gap-2 max-md:px-1",
              index >= 2 && "max-[860px]:border-t max-[860px]:border-white/70",
            )}
          >
            {index > 0 ? <span className="absolute left-0 top-1/2 h-7 w-px -translate-y-1/2 bg-[linear-gradient(180deg,transparent,#AFC4DF,transparent)] max-[860px]:hidden" aria-hidden="true" /> : null}
            <Icon className="h-[19px] w-[19px] flex-none text-[#0A6CFA] max-md:h-[18px] max-md:w-[18px]" strokeWidth={2.05} aria-hidden="true" />
            <span>{fact.text}</span>
          </li>
        );
      })}
    </ul>
  );
}

function SectionIntro({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="max-w-[760px]">
      <p className="text-[0.76rem] font-extrabold uppercase tracking-[0.08em] text-[#0969FF]">{eyebrow}</p>
      <h2 className="mt-3 text-[clamp(1.8rem,2.7vw,2.5rem)] font-extrabold leading-[1.12] tracking-[-0.025em] text-[#071A3D]">{title}</h2>
      <p className="mt-4 max-w-[680px] text-[1rem] font-medium leading-[1.65] text-[#41506B] max-md:text-[0.94rem]">{body}</p>
    </div>
  );
}

function PendingInsightSection({ copy: t }: { copy: HomeCopy }) {
  return (
    <section id="what-you-get" className="relative z-10 mx-auto mt-14 w-full max-w-[1240px] scroll-mt-28 px-5 xl:px-0 2xl:max-w-[1320px]">
      <SectionIntro {...t.sections.insights} />

      <div className="mt-8 hidden grid-cols-2 gap-6 lg:grid xl:grid-cols-4 xl:gap-9">
        {t.insights.map((insight, index) => (
          <PendingInsightCard key={insight.title} insight={insight} index={index} />
        ))}
      </div>

      <div className="-mx-5 mt-7 lg:hidden">
        <p id="insight-swipe-hint" className="mb-3 flex items-center gap-2 px-5 text-[0.8rem] font-bold text-[#50627F]">
          <MoveHorizontal className="h-4 w-4 text-[#0969FF]" aria-hidden="true" />
          {t.sections.insights.swipeHint}
        </p>
        <div
          className="flex snap-x snap-mandatory scroll-px-5 gap-4 overflow-x-auto px-5 pb-4 outline-none [scrollbar-width:none] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0969FF] [&::-webkit-scrollbar]:hidden"
          role="region"
          aria-label={t.nav.whatYouGet}
          aria-describedby="insight-swipe-hint"
          tabIndex={0}
        >
          {t.insights.map((insight, index) => (
            <div key={insight.title} className="w-[86vw] max-w-[360px] flex-none snap-start">
              <PendingInsightCard insight={insight} index={index} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PendingInsightCard({
  insight,
  index,
}: {
  insight: HomeCopy["insights"][number];
  index: number;
}) {
  const Icon = insight.icon;

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay: 0.05 * index }}
      className="min-h-[232px] rounded-[18px] border border-[#DDE7F5] bg-white/72 p-7 shadow-[0_14px_38px_rgba(15,23,42,0.06)] backdrop-blur-xl max-md:min-h-[224px]"
    >
      <div className={clsx("flex h-12 w-12 items-center justify-center rounded-[14px]", iconToneClass[insight.tone])}>
        <Icon className="h-7 w-7" strokeWidth={2.15} aria-hidden="true" />
      </div>
      <h2 className="mt-6 text-[1.08rem] font-extrabold leading-tight text-[#0B1F3A]">{insight.title}</h2>
      <p className="mt-3 min-h-[52px] text-[0.91rem] font-medium leading-[1.55] text-[#41506B]">{insight.body}</p>
      <p className="mt-5 inline-flex items-center gap-2 text-[0.84rem] font-semibold text-[#36506F]">
        <CheckCircle2 className="h-5 w-5 flex-none text-[#0969FF]" strokeWidth={2.1} aria-hidden="true" />
        {insight.detail}
      </p>
    </motion.article>
  );
}

function ProcessSection({ copy: t }: { copy: HomeCopy }) {
  return (
    <section id="how-it-works" className="relative z-10 mx-auto mt-16 w-full max-w-[1240px] scroll-mt-28 px-5 xl:px-0 2xl:max-w-[1320px]">
      <SectionIntro {...t.sections.process} />

      <div className="mt-8 grid grid-cols-1 items-center gap-4 xl:grid-cols-[1fr_auto_1fr_auto_1fr] xl:gap-5">
        {t.process.map((step, index) => (
          <ProcessFragment key={step.label} step={step} index={index} />
        ))}
      </div>
    </section>
  );
}

function ProcessFragment({ step, index }: { step: HomeCopy["process"][number]; index: number }) {
  const Icon = step.icon;

  return (
    <>
      {index > 0 ? (
        <div className="hidden items-center justify-center xl:flex" aria-hidden="true">
          <ChevronDown className="-rotate-90 text-[#0969FF]" />
        </div>
      ) : null}
      <article className="min-h-[178px] rounded-[18px] border border-[#DDE7F5] bg-white/72 px-7 py-6 shadow-[0_12px_34px_rgba(15,23,42,0.05)] backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[#0969FF] bg-white text-[1rem] font-extrabold text-[#0969FF]">
            {index + 1}
          </span>
          <h2 className="text-[1.02rem] font-extrabold text-[#0B1F3A]">{step.label}</h2>
        </div>
        <div className="mt-6 flex items-start gap-4">
          <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-[#EDF5FF] text-[#0969FF]">
            <Icon className="h-6 w-6" strokeWidth={2.1} aria-hidden="true" />
          </span>
          <p className="text-[0.9rem] font-medium leading-[1.58] text-[#41506B]">{step.body}</p>
        </div>
      </article>
    </>
  );
}

function ReleaseContextSection({ copy: t, locale }: { copy: HomeCopy; locale: Locale }) {
  return (
    <section className="relative z-10 mx-auto mt-16 w-full max-w-[1240px] px-5 xl:px-0 2xl:max-w-[1320px]">
      <div className="relative overflow-hidden rounded-[28px] border border-[#CFE1F7] bg-[radial-gradient(circle_at_9%_5%,rgba(34,211,238,0.13),transparent_34%),radial-gradient(circle_at_90%_95%,rgba(124,58,237,0.11),transparent_36%),linear-gradient(132deg,rgba(255,255,255,0.94),rgba(239,247,255,0.9))] px-10 py-12 shadow-[0_24px_70px_rgba(37,99,235,0.09)] max-md:px-6 max-md:py-9">
        <div className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-[linear-gradient(180deg,transparent,#C8DDF6,transparent)] lg:block" aria-hidden="true" />
        <div className="relative grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
          <p className="text-[0.76rem] font-extrabold uppercase text-[#0969FF]">{t.methodology.eyebrow}</p>
          <h2 className="mt-3 text-[1.7rem] font-extrabold leading-tight text-[#071A3D]">{t.methodology.title}</h2>
          <p className="mt-3 max-w-[580px] text-[0.96rem] font-medium leading-[1.65] text-[#41506B]">{t.methodology.body}</p>
          <ul className="mt-5 space-y-3">
            {t.methodology.points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-[0.9rem] font-semibold leading-[1.5] text-[#26385E]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-[#0969FF]" aria-hidden="true" />
                {point}
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/methodology`} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-[10px] text-[0.92rem] font-extrabold text-[#0969FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563EB]">
            {t.methodology.link}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          </div>

          <div>
            <p className="text-[0.76rem] font-extrabold uppercase text-[#7C3AED]">{t.coverage.eyebrow}</p>
            <h2 className="mt-3 text-[1.7rem] font-extrabold leading-tight text-[#071A3D]">{t.coverage.title}</h2>
            <p className="mt-3 max-w-[580px] text-[0.96rem] font-medium leading-[1.65] text-[#41506B]">{t.coverage.body}</p>
            <ul className="mt-6 grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {t.coverage.statuses.map((status, index) => (
                <li key={status} className="flex items-center gap-3 text-[0.86rem] font-bold text-[#26385E]">
                  <span className={clsx("h-2.5 w-2.5 flex-none rounded-full", index === 0 ? "bg-[#0969FF]" : index === 1 ? "bg-[#06B6D4]" : index === 2 ? "bg-[#7C3AED]" : "bg-[#8EA2BF]")} aria-hidden="true" />
                  {status}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function FAQSection({ copy: t, openFaq, onToggle }: { copy: HomeCopy; openFaq: number | null; onToggle: (index: number) => void }) {
  return (
    <section id="faq" className="relative z-10 mx-auto mt-16 w-full max-w-[1240px] scroll-mt-28 px-5 xl:px-0 2xl:max-w-[1320px]">
      <SectionIntro {...t.sections.faq} />

      <div className="mt-8 overflow-hidden rounded-[18px] border border-[#D5E3F4] bg-white/78 shadow-[0_16px_48px_rgba(15,23,42,0.055)] backdrop-blur-xl">
        {t.faq.map((item, index) => {
          const open = openFaq === index;
          return (
            <div key={item.question} className={clsx(index > 0 && "border-t border-[#DDE7F5]")}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`faq-panel-${index}`}
                onClick={() => onToggle(index)}
                className="flex min-h-[42px] w-full items-center justify-between gap-4 px-8 py-3 text-left text-[0.96rem] font-extrabold text-[#071A3D] transition hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-[#2563EB] max-md:px-5"
              >
                {item.question}
                <ChevronDown className={clsx("h-5 w-5 flex-none transition", open && "rotate-180")} aria-hidden="true" />
              </button>
              {open ? (
                <div id={`faq-panel-${index}`} className="px-8 pb-5 text-[0.94rem] font-medium leading-[1.65] text-[#41506B] max-md:px-5">
                  {item.answer}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FinalCTA({ copy: t, locale }: { copy: HomeCopy; locale: Locale }) {
  return (
    <section id="contact" className="relative z-10 mx-auto mt-12 w-full max-w-[1240px] px-5 pb-4 xl:px-0 2xl:max-w-[1320px]">
      <div className="flex items-center gap-7 rounded-[16px] border border-[#DDE7F5] bg-white/72 px-8 py-6 shadow-[0_16px_42px_rgba(15,23,42,0.055)] backdrop-blur-xl max-lg:flex-col max-lg:items-start max-md:px-5">
        <div className="flex h-[86px] w-[86px] flex-none items-center justify-center rounded-full bg-[radial-gradient(circle,#FFFFFF_0%,#EBF5FF_56%,#DDEBFF_100%)] shadow-[inset_0_0_0_1px_rgba(37,99,235,0.22),0_8px_28px_rgba(37,99,235,0.14)]">
          <FooterIcon className="h-11 w-11 text-[#0969FF]" strokeWidth={1.9} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[1.55rem] font-extrabold leading-tight text-[#071A3D] max-md:text-[1.35rem]">{t.finalCta.title}</h2>
          <p className="mt-2 text-[0.98rem] font-medium leading-[1.6] text-[#41506B]">{t.finalCta.body}</p>
          <p className="mt-3 inline-flex items-start gap-2 text-[0.82rem] font-medium leading-[1.45] text-[#41506B]">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-[#0969FF]" aria-hidden="true" />
            {t.finalCta.note}
          </p>
        </div>
        <div className="flex flex-none flex-wrap items-center justify-end gap-3 max-lg:w-full max-lg:items-stretch max-lg:justify-start">
          <Link
            href={`/${locale}/address-check`}
            className="inline-flex h-[56px] min-w-[210px] items-center justify-center rounded-[12px] border border-[#A9C5EA] bg-white/80 px-5 text-[0.9rem] font-bold text-[#0758D2] transition hover:-translate-y-0.5 hover:border-[#7EACE8] hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] max-lg:min-w-0"
          >
            {t.finalCta.secondary}
          </Link>
          <Link
            href={`/${locale}/check`}
            className="inline-flex h-[56px] min-w-[250px] items-center justify-center gap-3 rounded-[12px] bg-[linear-gradient(92deg,#0969FF_0%,#2563EB_45%,#7C3AED_100%)] px-6 text-[0.94rem] font-bold text-white shadow-[0_14px_30px_rgba(37,99,235,0.24)] transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] max-lg:min-w-0"
          >
            {t.finalCta.primary}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer({
  copy: t,
  locale,
  openGroup,
  onGroupChange,
}: {
  copy: HomeCopy;
  locale: Locale;
  openGroup: string | null;
  onGroupChange: (group: string | null) => void;
}) {
  const groups = [
    { key: "product", label: t.footer.product, links: t.footer.links.product },
    { key: "resources", label: t.footer.resources, links: t.footer.links.resources },
    { key: "legal", label: t.footer.legal, links: t.footer.links.legal },
  ];

  return (
    <footer id="resources" className="relative z-10 mt-0 bg-[linear-gradient(112deg,#061638_0%,#082A63_54%,#001936_100%)] text-white">
      <div className="mx-auto grid max-w-[1240px] grid-cols-[1.5fr_1fr_1fr_1fr_1fr] gap-9 px-5 py-8 max-lg:grid-cols-1 max-lg:py-7 xl:px-0 2xl:max-w-[1320px]">
        <div>
          <TymraLogo locale={locale} footer />
          <p className="mt-8 text-[0.92rem] font-medium text-white/82">{t.footer.copyright}</p>
        </div>

        <div className="hidden contents lg:contents">
          {groups.map((group) => (
            <FooterLinkGroup key={group.key} label={group.label} links={group.links} />
          ))}
          <div>
            <a
              href={locale === "en" ? "/zh" : "/en"}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-[0.95rem] font-semibold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {t.footer.language}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="space-y-2 lg:hidden">
          {groups.map((group) => (
            <MobileFooterAccordion
              key={group.key}
              label={group.label}
              links={group.links}
              open={openGroup === group.key}
              onToggle={() => onGroupChange(openGroup === group.key ? null : group.key)}
            />
          ))}
          <a
            href={locale === "en" ? "/zh" : "/en"}
            className="flex min-h-12 items-center justify-between rounded-[14px] border border-white/12 px-4 text-[0.98rem] font-semibold text-white"
          >
            {t.footer.language}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </footer>
  );
}

function FooterLinkGroup({ label, links }: { label: string; links: Array<{ label: string; href: string }> }) {
  return (
    <div>
      <h2 className="text-[0.95rem] font-extrabold text-white">{label}</h2>
      <ul className="mt-4 space-y-3">
        {links.map((link) => (
          <li key={link.href}>
            <a
              href={link.href}
              className="text-[0.92rem] font-medium text-white/84 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
            >
              {link.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MobileFooterAccordion({
  label,
  links,
  open,
  onToggle,
}: {
  label: string;
  links: Array<{ label: string; href: string }>;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rounded-[14px] border border-white/12">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-12 w-full items-center justify-between px-4 text-[0.98rem] font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-white"
      >
        {label}
        <ChevronDown className={clsx("h-4 w-4 transition", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <ul className="space-y-1 px-4 pb-3">
          {links.map((link) => (
            <li key={link.href}>
              <a className="block rounded-[10px] py-2 text-[0.92rem] font-medium text-white/84" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
