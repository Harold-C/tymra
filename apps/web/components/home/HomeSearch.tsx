"use client";

/* eslint-disable @next/next/no-img-element */
import { FormEvent } from "react";
import type React from "react";
import Link from "next/link";
import { ArrowRight, CircleAlert, LoaderCircle, Search, X } from "lucide-react";
import clsx from "clsx";
import type { HomeCopy, Locale } from "../../lib/home-content";
import { getInputType } from "../../lib/home-validation";
import { trackEvent } from "../../lib/analytics";
import { SearchState } from "./search-types";
import { getDeviceType } from "./search-device";

export function SearchCard({
  copy: t,
  locale,
  state,
  value,
  inputRef,
  onValueChange,
  onClear,
  onSubmit,
  hydrated,
}: {
  copy: HomeCopy;
  locale: Locale;
  state: SearchState;
  value: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onValueChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (event?: FormEvent) => void;
  hydrated: boolean;
}) {
  const hasValidationError = state.status === "validationError";
  const requiresChallenge = state.status === "challenge";
  const submitting = state.status === "submitting";

  return (
    <form
      id="price-check-search-card"
      onSubmit={onSubmit}
      data-hydrated={hydrated ? "true" : "false"}
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

export function SearchSupportingInfo({ copy: t }: { copy: HomeCopy }) {
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
