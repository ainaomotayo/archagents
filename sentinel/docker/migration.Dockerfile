FROM node:22-alpine
WORKDIR /app
RUN addgroup --system --gid 1001 sentinel && \
    adduser --system --uid 1001 --ingroup sentinel sentinel
COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/package.json ./packages/db/
RUN cd packages/db && npm install prisma @prisma/client && npx prisma generate
USER sentinel
CMD ["npx", "prisma", "migrate", "deploy", "--schema=./packages/db/prisma/schema.prisma"]
