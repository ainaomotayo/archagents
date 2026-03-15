#!/bin/sh
set -e
if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Running database migrations..."
  npx prisma migrate deploy --schema=./packages/db/prisma/schema.prisma
  echo "Migrations complete."
fi
exec "$@"
