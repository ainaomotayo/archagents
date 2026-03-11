FROM node:20-alpine AS base

RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

WORKDIR /app

# Copy root workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy all package.json files for workspace resolution
COPY apps/api/package.json apps/api/
COPY apps/api/tsconfig.json apps/api/
COPY packages/assessor/package.json packages/assessor/
COPY packages/audit/package.json packages/audit/
COPY packages/auth/package.json packages/auth/
COPY packages/compliance/package.json packages/compliance/
COPY packages/db/package.json packages/db/
COPY packages/events/package.json packages/events/
COPY packages/github/package.json packages/github/
COPY packages/notifications/package.json packages/notifications/
COPY packages/security/package.json packages/security/
COPY packages/shared/package.json packages/shared/
COPY packages/telemetry/package.json packages/telemetry/

RUN pnpm install --frozen-lockfile

# Copy all source
COPY packages/ packages/
COPY apps/api/ apps/api/

# Build
RUN pnpm --filter @sentinel/api... build

WORKDIR /app/apps/api

EXPOSE 8080

CMD ["node", "dist/server.js"]
