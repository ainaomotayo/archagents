# SENTINEL API — multi-stage Node.js build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN corepack enable && pnpm config set enable-pre-post-scripts true && pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@sentinel/api

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder /app/packages/db/node_modules/.prisma ./node_modules/.prisma
COPY docker/entrypoint-api.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 8080
ENV NODE_ENV=production
ENTRYPOINT ["/entrypoint.sh"]
