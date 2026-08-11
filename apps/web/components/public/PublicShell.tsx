import { Menu, X } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { CustomerSignOut } from "@/components/member/CustomerSessionActions";
import { LocaleSwitchLink } from "./LocaleSwitchLink";

export async function PublicShell({ locale, children }: { locale: "en" | "zh"; children: React.ReactNode }) {
  const [nav, common, footer, customerSession] = await Promise.all([
    getTranslations("Nav"),
    getTranslations("Common"),
    getTranslations("Footer"),
    getCustomerSessionForPage(),
  ]);
  const footerGroups = [
    { label: footer("product"), links: [{ label: common("runCheck"), href: `/${locale}/check` }, { label: nav("pricing"), href: `/${locale}/pricing` }, { label: nav("how"), href: `/${locale}#how-it-works` }, { label: nav("what"), href: `/${locale}#what-you-get` }] },
    { label: footer("resources"), links: [{ label: nav("methodology"), href: `/${locale}/methodology` }, { label: nav("faq"), href: `/${locale}/faq` }, { label: nav("contact"), href: `/${locale}/contact` }] },
    { label: footer("legal"), links: [{ label: footer("privacy"), href: `/${locale}/privacy` }, { label: footer("terms"), href: `/${locale}/terms` }, { label: footer("cookies"), href: `/${locale}/cookies` }, { label: footer("disclaimer"), href: `/${locale}/disclaimer` }, { label: footer("deletion"), href: `/${locale}/delete-data` }] },
  ];

  return (
    <div className="public-page">
      <a className="skip-link" href="#main-content">{nav("skipToContent")}</a>
      <header className="public-header">
        <div className="public-container public-header-inner">
          <Link className="public-logo" href={`/${locale}`} aria-label={common("brand")}>
            <Image src="/tymra-logo.png" alt={common("brand")} width={1061} height={368} priority />
          </Link>
          <nav className="desktop-nav" aria-label={nav("primaryNavigation")}>
            <Link href={`/${locale}#how-it-works`}>{nav("how")}</Link>
            <Link href={`/${locale}#what-you-get`}>{nav("what")}</Link>
            <Link href={`/${locale}/pricing`}>{nav("pricing")}</Link>
            <Link href={`/${locale}/methodology`}>{nav("methodology")}</Link>
            <Link href={`/${locale}/faq`}>{nav("faq")}</Link>
            <Link href={`/${locale}/contact`}>{nav("contact")}</Link>
          </nav>
          <div className="header-actions">
            <LocaleSwitchLink className="language-link" locale={locale} label={common("language")} />
            {customerSession
              ? <><Link className="member-header-link" href={`/${locale}/account`}>{common("account")}</Link><CustomerSignOut locale={locale} label={common("signOut")} compact /></>
              : <Link className="member-header-link" href={`/${locale}/sign-in`}>{common("signIn")}</Link>}
            <Link className="button button-primary header-cta" href={`/${locale}/check`}>{common("runCheck")}</Link>
            <details className="mobile-menu">
              <summary className="mobile-menu-button" aria-label={nav("menu")}><Menu className="menu-open-icon" size={22} /><X className="menu-close-icon" size={22} /></summary>
              <nav aria-label={nav("mobileNavigation")}>
                <Link href={`/${locale}#how-it-works`}>{nav("how")}</Link>
                <Link href={`/${locale}#what-you-get`}>{nav("what")}</Link>
                <Link href={`/${locale}/pricing`}>{nav("pricing")}</Link>
                <Link href={`/${locale}/methodology`}>{nav("methodology")}</Link>
                <Link href={`/${locale}/faq`}>{nav("faq")}</Link>
                <Link href={`/${locale}/contact`}>{nav("contact")}</Link>
                {customerSession
                  ? <><Link href={`/${locale}/account`}>{common("account")}</Link><CustomerSignOut locale={locale} label={common("signOut")} /></>
                  : <Link href={`/${locale}/sign-in`}>{common("signIn")}</Link>}
                <Link className="button button-primary mobile-menu-cta" href={`/${locale}/check`}>{common("runCheck")}</Link>
              </nav>
            </details>
          </div>
        </div>
      </header>
      <main id="main-content">{children}</main>
      <footer className="public-footer">
        <div className="public-container footer-grid">
          <div>
            <Link className="public-logo footer-brand" href={`/${locale}`} aria-label={common("brand")}>
              <Image src="/tymra-logo.png" alt={common("brand")} width={1061} height={368} />
            </Link>
            <p>{footer("description")}</p>
          </div>
          {footerGroups.map((group) => (
            <div className="footer-links-desktop" key={group.label}>
              <h2>{group.label}</h2>
              {group.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}
            </div>
          ))}
          <div className="footer-links-mobile">
            {footerGroups.map((group) => (
              <details key={group.label}>
                <summary>{group.label}</summary>
                <div>{group.links.map((link) => <Link href={link.href} key={link.href}>{link.label}</Link>)}</div>
              </details>
            ))}
          </div>
        </div>
        <div className="public-container footer-bottom"><span>© 2026 Synix</span><LocaleSwitchLink locale={locale} label={common("language")} /></div>
      </footer>
    </div>
  );
}
