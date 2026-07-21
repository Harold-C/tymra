import type { Metadata } from "next";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { notFound } from "next/navigation";

const locales = new Set(["en", "zh"]);

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "zh" }];
}

export function generateMetadata({ params }: { params: { locale: string } }): Metadata {
  const isChinese = params.locale === "zh";
  return {
    title: isChinese ? "Tymra by Synix | 住宿价格情报" : "Tymra by Synix | Accommodation Pricing Intelligence",
    description: isChinese
      ? "帮助新西兰住宿经营者发现可能卖便宜的重点日期。"
      : "Find the dates your New Zealand accommodation may be selling too cheaply.",
    alternates: {
      canonical: `/${params.locale}`,
      languages: { en: "/en", "zh-CN": "/zh" },
    },
  };
}

export default function LocaleLayout({ children, params }: { children: React.ReactNode; params: { locale: string } }) {
  if (!locales.has(params.locale)) notFound();
  const messages = useMessages();
  return (
    <NextIntlClientProvider messages={messages}>
      <div lang={params.locale === "zh" ? "zh-CN" : "en-NZ"}>{children}</div>
    </NextIntlClientProvider>
  );
}

