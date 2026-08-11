import { getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";
import { getCustomerSessionForPage } from "@/lib/server/membership/customer-auth";
import { homeCopy } from "@/lib/home-content";
import { LocaleSwitchLink } from "./LocaleSwitchLink";
import { SiteHeader } from "./SiteHeader";

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
      <SiteHeader copy={homeCopy[locale].nav} locale={locale} signedIn={Boolean(customerSession)} />
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
