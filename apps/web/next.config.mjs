import path from "node:path";
import { fileURLToPath } from "node:url";

import nextEnv from "@next/env";
import createNextIntlPlugin from "next-intl/plugin";

const { loadEnvConfig } = nextEnv;
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
loadEnvConfig(repositoryRoot);

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["@tymra/config", "@tymra/db", "@tymra/domain", "@tymra/providers", "@tymra/queue"],
};

export default withNextIntl(nextConfig);
