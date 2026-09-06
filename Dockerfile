# syntax=docker/dockerfile:1

ARG NODE_IMAGE=node:22.23.1-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3

FROM ${NODE_IMAGE} AS base

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY docker-entrypoint.sh /usr/local/bin/aero-diary-entrypoint
RUN chmod 0755 /usr/local/bin/aero-diary-entrypoint
RUN apt-get update \
  && apt-get install --no-install-recommends --yes ca-certificates openssl \
  && rm -rf /var/lib/apt/lists/*

FROM base AS pnpm

ENV PNPM_HOME=/pnpm
ENV PATH=${PNPM_HOME}:${PATH}

RUN npm install --global --ignore-scripts pnpm@11.17.0

FROM pnpm AS deps

RUN apt-get update \
  && apt-get install --no-install-recommends --yes g++ make python3 \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS builder

COPY . .
RUN pnpm build

FROM base AS migrate

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=deps /app/prisma.config.ts ./
COPY --from=deps /app/prisma ./prisma

ENV NODE_ENV=production
RUN mkdir -p /app/data && chown node:node /app/data

ENTRYPOINT ["/usr/local/bin/aero-diary-entrypoint", "--migrate"]

CMD ["node_modules/.bin/prisma", "migrate", "deploy"]

FROM base AS runtime

ENV NODE_ENV=production
# Keep Next's pnpm standalone dependency tree on Node's traced CommonJS path.
ENV NODE_OPTIONS=--no-experimental-require-module
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

RUN mkdir -p /app/data && chown node:node /app/data

ENTRYPOINT ["/usr/local/bin/aero-diary-entrypoint", "--runtime"]

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["/usr/local/bin/aero-diary-entrypoint", "--healthcheck"]

CMD ["node", "server.js"]
