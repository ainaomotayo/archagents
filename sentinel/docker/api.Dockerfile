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
RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 sentinel && \
    adduser --system --uid 1001 --ingroup sentinel sentinel
COPY --from=builder --chown=sentinel:sentinel /app/node_modules ./node_modules
COPY --from=builder --chown=sentinel:sentinel /app/apps/api/dist ./apps/api/dist
COPY --from=builder --chown=sentinel:sentinel /app/packages/db/prisma ./packages/db/prisma
COPY --from=builder --chown=sentinel:sentinel /app/packages/db/node_modules/.prisma ./node_modules/.prisma
COPY --chown=sentinel:sentinel docker/entrypoint-api.sh ./entrypoint.sh
COPY --chown=sentinel:sentinel docker/healthcheck.js ./healthcheck.js
RUN chmod +x ./entrypoint.sh
EXPOSE 8080
ENV NODE_ENV=production
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "healthcheck.js"]
USER sentinel
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "apps/api/dist/server.js"]
