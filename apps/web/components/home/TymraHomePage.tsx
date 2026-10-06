"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useHomeSearch } from "./useHomeSearch";

import { SiteHeader } from "@/components/public/SiteHeader";
import { homeCopy } from "../../lib/home-content";
import type { Locale } from "../../lib/home-content";
import { HeroSection } from "./HomeHero";
import { PendingInsightSection, ProcessSection, ReleaseContextSection, FAQSection, FinalCTA } from "./HomeSections";
import { Footer } from "./HomeFooter";

export function getLocaleFromPath(pathname: string | null): Locale {
  return pathname?.startsWith("/zh") ? "zh" : "en";
}

export function TymraHomePage({ signedIn = false, discoveryHidden = false }: { signedIn?: boolean; discoveryHidden?: boolean }) {
  const pathname = usePathname();
  const locale = getLocaleFromPath(pathname);
  const t = homeCopy[locale];
  const { inputRef, hydrated, searchState, value, updateValue, clearSearch, submitSearch, focusSearchFromHeader } = useHomeSearch(locale);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [openFooterGroup, setOpenFooterGroup] = useState<string | null>(null);

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
        discoveryHidden={discoveryHidden}
        onPrimaryAction={discoveryHidden ? undefined : focusSearchFromHeader}
      />

      <main
        id="main-content"
        className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_50%_10%,rgba(37,99,235,0.055),transparent_36%),radial-gradient(circle_at_86%_28%,rgba(124,58,237,0.045),transparent_30%),linear-gradient(180deg,#FFFFFF_0%,#F8FBFF_58%,#FFFFFF_100%)] text-[#0B1F3A]"
      >
        {!discoveryHidden ? <HeroSection
          copy={t}
          locale={locale}
          searchState={searchState}
          value={value}
          inputRef={inputRef}
          onValueChange={updateValue}
          onClear={clearSearch}
          onSubmit={submitSearch}
          hydrated={hydrated}
        /> : null}

        <PendingInsightSection copy={t} />
        <ProcessSection copy={t} />
        <ReleaseContextSection copy={t} locale={locale} />
        <FAQSection copy={t} openFaq={openFaq} onToggle={toggleFaq} />
        {!discoveryHidden ? <FinalCTA copy={t} locale={locale} /> : null}
      </main>
      <Footer copy={t} locale={locale} openGroup={openFooterGroup} onGroupChange={setOpenFooterGroup} discoveryHidden={discoveryHidden} />
    </>
  );
}
