import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@tymra/config", "@tymra/db", "@tymra/domain", "@tymra/providers", "@tymra/ui"],
};

export default withNextIntl(nextConfig);
