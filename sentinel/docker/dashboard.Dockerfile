# SENTINEL Dashboard — Next.js standalone build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/dashboard/ ./apps/dashboard/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@sentinel/dashboard

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=builder /app/apps/dashboard/.next/standalone ./
COPY --from=builder /app/apps/dashboard/.next/static ./.next/static
COPY --from=builder /app/apps/dashboard/public ./public
EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "apps/dashboard/server.js"]
