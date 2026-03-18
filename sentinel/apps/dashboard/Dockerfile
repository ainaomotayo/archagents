FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.30.3 --activate

# ── deps stage: install all workspace deps ────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY tsconfig.base.json ./

# Copy package manifests for workspace resolution
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/dashboard/tsconfig.json apps/dashboard/
COPY packages/auth/package.json packages/auth/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/security/package.json packages/security/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile

# ── builder stage: build the Next.js app ─────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY packages/auth/ packages/auth/
COPY packages/policy-engine/ packages/policy-engine/
COPY packages/security/ packages/security/
COPY packages/shared/ packages/shared/
COPY apps/dashboard/ apps/dashboard/

RUN pnpm --filter @sentinel/dashboard... build

# ── runner stage: minimal production image ───────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# next.config.ts sets output: "standalone" — copy the self-contained output
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static     ./apps/dashboard/.next/static
COPY --from=builder /app/apps/dashboard/public           ./apps/dashboard/public

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/dashboard/server.js"]
