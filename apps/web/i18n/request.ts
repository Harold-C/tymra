import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

const locales = new Set(["en", "zh"]);

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;
  if (!locale || !locales.has(locale)) notFound();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: "Pacific/Auckland",
  };
});
