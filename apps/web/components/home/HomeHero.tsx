"use client";

/* eslint-disable @next/next/no-img-element */
import { FormEvent } from "react";
import type React from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { QuantumWaveCanvas } from "./QuantumWaveCanvas";
import { badgeIcon as BadgeIcon } from "../../lib/home-content";
import type { HomeCopy, Locale } from "../../lib/home-content";
import { SearchState } from "./search-types";
import { SearchCard } from "./HomeSearch";

export function HeroSection({
  copy: t,
  locale,
  searchState,
  value,
  inputRef,
  onValueChange,
  onClear,
  onSubmit,
  hydrated,
}: {
  copy: HomeCopy;
  locale: Locale;
  searchState: SearchState;
  value: string;
  inputRef: React.RefObject<HTMLInputElement>;
  onValueChange: (value: string) => void;
  onClear: () => void;
  onSubmit: (event?: FormEvent) => void;
  hydrated: boolean;
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
        hydrated={hydrated}
      />
    </section>
  );
}

export function SignalLandscape() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-[calc(50%-50vw)] top-[150px] z-0 h-[610px] overflow-hidden opacity-95 max-md:top-[172px] max-md:h-[620px]"
    >
      <QuantumWaveCanvas className="absolute inset-y-0 left-1/2 h-full w-[110vw] max-w-none -translate-x-1/2 opacity-100" />
    </div>
  );
}
