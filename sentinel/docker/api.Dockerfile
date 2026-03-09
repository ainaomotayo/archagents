# SENTINEL API — multi-stage Node.js build
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm turbo build --filter=@sentinel/api
# Deploy creates a self-contained directory with all dependencies
RUN pnpm --filter=@sentinel/api deploy --legacy --prod /app/deploy

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache wget
COPY --from=builder /app/deploy/node_modules ./node_modules
COPY --from=builder /app/deploy/dist ./dist
COPY --from=builder /app/deploy/package.json ./
EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "dist/server.js"]
