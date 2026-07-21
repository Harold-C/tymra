# syntax=docker/dockerfile:1.7

FROM node:24.14-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/browser-worker/package.json apps/browser-worker/package.json
COPY packages/browser-runtime/package.json packages/browser-runtime/package.json
COPY packages/browser-site-extractors/package.json packages/browser-site-extractors/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/queue/package.json packages/queue/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN ./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma

FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000 3100
CMD ["pnpm", "--filter", "@tymra/web", "dev"]

FROM base AS build
RUN pnpm --filter @tymra/web build \
  && pnpm --filter @tymra/worker build

FROM build AS production
ENV NODE_ENV=production
ENV NEXT_DIST_DIR=.next-build
EXPOSE 3000
CMD ["pnpm", "--filter", "@tymra/web", "start"]
