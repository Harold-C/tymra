"use client";

/* eslint-disable @next/next/no-img-element */

import { ArrowRight, ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { HomeCopy, Locale } from "../../lib/home-content";

export function TymraLogo({ locale, footer = false }: { locale: Locale; footer?: boolean }) {
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

export function Footer({
  copy: t,
  locale,
  openGroup,
  onGroupChange,
  discoveryHidden,
}: {
  copy: HomeCopy;
  locale: Locale;
  openGroup: string | null;
  onGroupChange: (group: string | null) => void;
  discoveryHidden: boolean;
}) {
  const groups = [
    { key: "product", label: t.footer.product, links: discoveryHidden ? t.footer.links.product.filter((link) => !/\/(?:en|zh)\/(?:check|pricing|sign-in|sign-up|address-check)(?:$|[?#])/.test(link.href)) : t.footer.links.product },
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

export function FooterLinkGroup({ label, links }: { label: string; links: Array<{ label: string; href: string }> }) {
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

export function MobileFooterAccordion({
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
