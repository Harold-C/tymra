# syntax=docker/dockerfile:1.7

FROM node:24.14-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/queue/package.json packages/queue/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN ./node_modules/.bin/prisma generate --schema packages/db/prisma/schema.prisma

FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000 3100
CMD ["./node_modules/.bin/next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]

FROM base AS build
RUN NODE_ENV=production NEXT_DIST_DIR=.next-build ./node_modules/.bin/next build \
  && cd apps/worker \
  && ./node_modules/.bin/tsup src/index.ts src/api.ts src/scheduler.ts src/cli.ts --format esm --platform node --target node22 --out-dir dist --sourcemap --clean

FROM build AS production
ENV NODE_ENV=production
ENV NEXT_DIST_DIR=.next-build
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
