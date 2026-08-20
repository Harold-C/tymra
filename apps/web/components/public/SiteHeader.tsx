"use client";

import clsx from "clsx";
import { ArrowRight, ChevronDown, Menu, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";

import { CustomerSignOut } from "@/components/member/CustomerSessionActions";
import { trackEvent } from "@/lib/analytics";

import { LocaleSwitchLink } from "./LocaleSwitchLink";

type Locale = "en" | "zh";
type HeaderSectionId = "how-it-works" | "what-you-get" | "faq";
type HeaderNavItem = {
  label: string;
  href: string;
  path?: string;
  section?: HeaderSectionId;
};

export type SiteHeaderCopy = {
  howItWorks: string;
  whatYouGet: string;
  pricing: string;
  methodology: string;
  faq: string;
  cta: string;
  language: string;
  languageAria: string;
  menuOpen: string;
  menuClose: string;
  primaryNavigation: string;
  mobileNavigation: string;
  signIn: string;
  account: string;
  signOut: string;
};

const trackedHeaderSections: HeaderSectionId[] = ["what-you-get", "how-it-works", "faq"];

function getDeviceType() {
  return window.matchMedia("(max-width: 1023px)").matches ? "mobile" : "desktop";
}

export function SiteHeader({
  copy,
  locale,
  signedIn = false,
  onPrimaryAction,
}: {
  copy: SiteHeaderCopy;
  locale: Locale;
  signedIn?: boolean;
  onPrimaryAction?: () => void;
}) {
  const pathname = usePathname();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<HeaderSectionId | null>(null);
  const homePath = `/${locale}`;
  const isHome = pathname === homePath || pathname === `${homePath}/`;
  const navItems: HeaderNavItem[] = [
    { label: copy.howItWorks, href: `${isHome ? "" : homePath}#how-it-works`, section: "how-it-works" },
    { label: copy.whatYouGet, href: `${isHome ? "" : homePath}#what-you-get`, section: "what-you-get" },
    { label: copy.pricing, href: `/${locale}/pricing`, path: `/${locale}/pricing` },
    { label: copy.methodology, href: `/${locale}/methodology`, path: `/${locale}/methodology` },
    {
      label: copy.faq,
      href: isHome ? "#faq" : `/${locale}/faq`,
      path: `/${locale}/faq`,
      section: isHome ? "faq" : undefined,
    },
  ];

  useEffect(() => {
    let animationFrame = 0;

    function updateHeaderState() {
      animationFrame = 0;
      const scrolled = window.scrollY > 12;
      setIsScrolled((current) => current === scrolled ? current : scrolled);

      if (!isHome) return;
      const activationLine = 128;
      const nextSection = trackedHeaderSections.find((sectionId) => {
        const section = document.getElementById(sectionId);
        if (!section) return false;
        const bounds = section.getBoundingClientRect();
        return bounds.top <= activationLine && bounds.bottom > activationLine;
      }) ?? null;
      setActiveSection((current) => current === nextSection ? current : nextSection);
    }

    function scheduleUpdate() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateHeaderState);
    }

    updateHeaderState();
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    if (isHome) window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
    };
  }, [isHome]);

  function navigateToSection(event: React.MouseEvent<HTMLAnchorElement>, item: HeaderNavItem) {
    if (!isHome || !item.section) return;
    const section = document.getElementById(item.section);
    if (!section) return;
    event.preventDefault();
    window.history.pushState(null, "", item.href);
    setActiveSection(item.section);
    section.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  function itemIsActive(item: HeaderNavItem) {
    if (isHome && item.section) return activeSection === item.section;
    return item.path === pathname;
  }

  function runPrimaryAction() {
    setMenuOpen(false);
    if (onPrimaryAction) window.setTimeout(onPrimaryAction, 0);
  }

  return (
    <header
      className={clsx(
        "sticky top-0 z-[90] border-b transition-[background-color,border-color,box-shadow,backdrop-filter] duration-200",
        isScrolled || menuOpen || !isHome
          ? "border-[#DCE7F5]/80 bg-white/[0.94] shadow-[0_8px_28px_rgba(15,23,42,0.055)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/[0.84]"
          : "border-transparent bg-transparent",
      )}
    >
      <div
        className={clsx(
          "mx-auto grid h-[82px] w-full max-w-[1440px] grid-cols-[1fr_auto] items-center px-6 transition-[height] duration-200 md:h-[86px] md:px-[30px] min-[1440px]:grid-cols-[minmax(152px,1fr)_auto_minmax(370px,1fr)] 2xl:max-w-[1560px]",
          isScrolled && "min-[1440px]:h-[76px]",
        )}
      >
        <Link
          aria-label="Tymra by Synix"
          className="block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB]"
          href={`/${locale}`}
        >
          <Image
            src="/tymra-logo.png"
            alt="Tymra by Synix"
            className="h-auto w-[152px] object-contain max-lg:w-[136px]"
            width={1061}
            height={368}
            priority
          />
        </Link>

        <nav
          aria-label={copy.primaryNavigation}
          className={clsx(
            "hidden items-center gap-1 justify-self-center text-[0.94rem] font-semibold text-[#071A3D] min-[1440px]:flex",
            locale === "zh" && "tracking-[0.012em]",
          )}
        >
          {navItems.map((item) => {
            const active = itemIsActive(item);
            return (
              <a
                key={item.label}
                aria-current={active ? (item.section && isHome ? "location" : "page") : undefined}
                className={clsx(
                  "group relative inline-flex min-h-11 items-center rounded-xl px-2.5 transition-[color,background-color] duration-200 hover:bg-[#F4F8FF] hover:text-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]",
                  active && "bg-[#F4F8FF]/80 text-[#0758D2]",
                )}
                href={item.href}
                onClick={(event) => navigateToSection(event, item)}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={clsx(
                    "absolute inset-x-2.5 bottom-1 h-0.5 origin-left rounded-full bg-[linear-gradient(90deg,#0969FF,#7C3AED)] transition-transform duration-200 motion-reduce:transition-none",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                  )}
                />
              </a>
            );
          })}
        </nav>

        <div className="hidden items-center justify-self-end min-[1440px]:flex">
          <span aria-hidden="true" className="mr-3 h-7 w-px bg-[#D8E3F1]/80" />
          <div className="flex items-center gap-0.5">
            <LanguageSelector copy={copy} locale={locale} />
            {signedIn ? (
              <HeaderAccountMenu copy={copy} locale={locale} />
            ) : (
              <Link className="inline-flex min-h-11 items-center rounded-xl px-3 text-[0.94rem] font-semibold text-[#071A3D] transition-colors duration-200 hover:bg-[#EDF5FF] hover:text-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]" href={`/${locale}/sign-in`}>
                {copy.signIn}
              </Link>
            )}
          </div>

          {onPrimaryAction ? (
            <button type="button" onClick={runPrimaryAction} className="ml-3.5 inline-flex h-11 min-w-[154px] items-center justify-center rounded-[12px] bg-[linear-gradient(92deg,#0969FF_0%,#2563EB_46%,#7C3AED_100%)] px-5 text-[0.94rem] font-bold text-white shadow-[0_8px_20px_rgba(37,99,235,0.16)] transition duration-200 hover:-translate-y-px hover:shadow-[0_11px_24px_rgba(37,99,235,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] motion-reduce:transform-none">
              {copy.cta}
            </button>
          ) : (
            <Link href={`/${locale}/check`} className="ml-3.5 inline-flex h-11 min-w-[154px] items-center justify-center rounded-[12px] bg-[linear-gradient(92deg,#0969FF_0%,#2563EB_46%,#7C3AED_100%)] px-5 text-[0.94rem] font-bold text-white shadow-[0_8px_20px_rgba(37,99,235,0.16)] transition duration-200 hover:-translate-y-px hover:shadow-[0_11px_24px_rgba(37,99,235,0.22)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2563EB] motion-reduce:transform-none">
              {copy.cta}
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5 min-[1440px]:hidden">
          <LanguageSelector copy={copy} locale={locale} compact />
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? copy.menuClose : copy.menuOpen}
            onClick={() => setMenuOpen((current) => !current)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-[#071A3D] transition-colors duration-200 hover:bg-[#EDF5FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
          >
            {menuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-7 w-7" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <MobileNavigation
          copy={copy}
          locale={locale}
          items={navItems}
          signedIn={signedIn}
          activeSection={activeSection}
          pathname={pathname}
          isHome={isHome}
          returnFocusRef={menuButtonRef}
          onMenuChange={setMenuOpen}
          onPrimaryAction={onPrimaryAction ? runPrimaryAction : undefined}
        />
      ) : null}
    </header>
  );
}

function HeaderAccountMenu({ copy, locale }: { copy: SiteHeaderCopy; locale: Locale }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeFromOutside(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }

    window.addEventListener("pointerdown", closeFromOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeFromOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
        className={clsx(
          "inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-[0.94rem] font-semibold text-[#071A3D] transition-colors duration-200 hover:bg-[#EDF5FF] hover:text-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]",
          open && "bg-[#EDF5FF] text-[#2563EB]",
        )}
      >
        <UserRound className="h-4 w-4" aria-hidden="true" />
        {copy.account}
        <ChevronDown className={clsx("h-4 w-4 transition-transform duration-200", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-[calc(100%+8px)] min-w-[188px] rounded-2xl border border-[#D8E4F2] bg-white p-2 shadow-[0_18px_48px_rgba(15,23,42,0.14)]">
          <Link role="menuitem" onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-2 rounded-xl px-3 text-[0.92rem] font-semibold text-[#071A3D] transition hover:bg-[#F2F7FF]" href={`/${locale}/account`}>
            <UserRound className="h-4 w-4 text-[#0969FF]" aria-hidden="true" />
            {copy.account}
          </Link>
          <div role="menuitem" className="mt-1 border-t border-[#E2E8F0] pt-1">
            <CustomerSignOut locale={locale} label={copy.signOut} compact />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LanguageSelector({ copy, locale, compact = false }: { copy: SiteHeaderCopy; locale: Locale; compact?: boolean }) {
  return (
    <LocaleSwitchLink
      ariaLabel={copy.languageAria}
      label={copy.language}
      locale={locale}
      onClick={() => {
        trackEvent({ name: "language_changed", properties: { locale, target: locale === "en" ? "zh" : "en", deviceType: getDeviceType() } });
      }}
      className={clsx(
        "inline-flex min-h-11 items-center gap-2 rounded-xl text-[0.92rem] font-semibold text-[#41506B] transition hover:bg-[#EDF5FF] hover:text-[#2563EB] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2563EB]",
        compact ? "px-3" : "px-2",
      )}
    />
  );
}

function MobileNavigation({
  copy,
  locale,
  items,
  signedIn,
  activeSection,
  pathname,
  isHome,
  returnFocusRef,
  onMenuChange,
  onPrimaryAction,
}: {
  copy: SiteHeaderCopy;
  locale: Locale;
  items: HeaderNavItem[];
  signedIn: boolean;
  activeSection: HeaderSectionId | null;
  pathname: string;
  isHome: boolean;
  returnFocusRef: React.RefObject<HTMLButtonElement | null>;
  onMenuChange: (open: boolean) => void;
  onPrimaryAction?: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const returnFocusElement = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus({ preventScroll: true });
    });

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onMenuChange(false);
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
      if (!focusable.length) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    }

    window.addEventListener("keydown", handleDialogKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleDialogKeyDown);
      returnFocusElement?.focus({ preventScroll: true });
    };
  }, [onMenuChange, returnFocusRef]);

  function handleItemClick(event: React.MouseEvent<HTMLAnchorElement>, item: HeaderNavItem) {
    if (isHome && item.section) {
      const section = document.getElementById(item.section);
      if (section) {
        event.preventDefault();
        window.history.pushState(null, "", item.href);
        onMenuChange(false);
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            section.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
              block: "start",
            });
          });
        });
        return;
      }
    }
    onMenuChange(false);
  }

  return createPortal(
    <div className="fixed inset-x-0 bottom-0 top-[82px] z-[80] bg-[#071A3D]/[0.42] px-4 pt-3 backdrop-blur-md md:top-[86px] min-[1440px]:hidden" role="presentation" onClick={() => onMenuChange(false)}>
      <nav
        ref={dialogRef}
        id="mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label={copy.mobileNavigation}
        className="site-mobile-navigation mx-auto max-h-[calc(100dvh-102px)] max-w-[420px] overflow-y-auto rounded-[24px] border border-[#DCE8F8] bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.2)]"
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => {
          const active = isHome && item.section ? activeSection === item.section : item.path === pathname;
          return (
            <a
              key={item.label}
              aria-current={active ? (item.section && isHome ? "location" : "page") : undefined}
              href={item.href}
              onClick={(event) => handleItemClick(event, item)}
              className={clsx(
                "flex min-h-12 items-center justify-between rounded-[16px] px-4 py-3 text-[1rem] font-semibold text-[#071A3D] transition-colors duration-200 hover:bg-[#F2F7FF] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]",
                active && "bg-[#EDF5FF] text-[#0969FF]",
              )}
            >
              {item.label}
              {active ? <span className="h-2 w-2 rounded-full bg-[#0969FF]" aria-hidden="true" /> : null}
            </a>
          );
        })}
        {signedIn ? (
          <>
            <Link href={`/${locale}/account`} onClick={() => onMenuChange(false)} className="block min-h-12 rounded-[16px] px-4 py-3 text-[1rem] font-semibold text-[#071A3D] transition hover:bg-[#F2F7FF]">{copy.account}</Link>
            <div className="px-4 py-3"><CustomerSignOut locale={locale} label={copy.signOut} /></div>
          </>
        ) : (
          <Link href={`/${locale}/sign-in`} onClick={() => onMenuChange(false)} className="block min-h-12 rounded-[16px] px-4 py-3 text-[1rem] font-semibold text-[#41506B] transition hover:bg-[#F2F7FF] hover:text-[#075ED8]">{copy.signIn}</Link>
        )}
        {onPrimaryAction ? (
          <button type="button" onClick={onPrimaryAction} className="mt-2 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(92deg,#0969FF_0%,#2563EB_46%,#7C3AED_100%)] px-4 text-[1rem] font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]">
            {copy.cta}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : (
          <Link href={`/${locale}/check`} onClick={() => onMenuChange(false)} className="mt-2 inline-flex min-h-[54px] w-full items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(92deg,#0969FF_0%,#2563EB_46%,#7C3AED_100%)] px-4 text-[1rem] font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.24)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]">
            {copy.cta}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>,
    document.body,
  );
}
