# syntax=docker/dockerfile:1.7

FROM node:24.14-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/providers/package.json packages/providers/package.json
COPY packages/queue/package.json packages/queue/package.json
RUN pnpm install --filter @tymra/web... --filter @tymra/worker... --frozen-lockfile

COPY . .
RUN cd packages/db && ./node_modules/.bin/prisma generate --schema prisma/schema.prisma

FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3000 3100
CMD ["pnpm", "--filter", "@tymra/web", "dev"]

FROM base AS build
RUN cd apps/web \
  && NODE_ENV=production NEXT_DIST_DIR=.next-build ./node_modules/.bin/next build \
  && cd /app/apps/worker \
  && pnpm build

FROM build AS production
ENV NODE_ENV=production
ENV NEXT_DIST_DIR=.next-build
RUN mkdir -p /argus-evidence \
  && chown -R node:node /app/apps/web/.next-build /argus-evidence
USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "--hostname", "0.0.0.0", "--port", "3000"]
