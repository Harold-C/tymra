FROM node:24.14-bookworm-slim

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_ENV=production
ENV HERO_SKIP_CHROME_DOWNLOAD=1
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/browser-worker/package.json apps/browser-worker/package.json
COPY packages/browser-runtime/package.json packages/browser-runtime/package.json
COPY packages/browser-site-extractors/package.json packages/browser-site-extractors/package.json
RUN pnpm install --filter @tymra/browser-worker... --frozen-lockfile

COPY apps/browser-worker apps/browser-worker
COPY packages/browser-runtime packages/browser-runtime
COPY packages/browser-site-extractors packages/browser-site-extractors

RUN mkdir -p /data/browser-worker/evidence /data/browser-worker/profiles \
  && chown -R node:node /data/browser-worker
USER node
EXPOSE 18888
CMD ["node", "apps/browser-worker/src/main.js"]
