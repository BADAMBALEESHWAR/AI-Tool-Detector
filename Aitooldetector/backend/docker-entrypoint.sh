#!/bin/sh
set -e

# Apply pending database migrations before the API starts.
npx prisma migrate deploy

# Seeding overwrites admin-changed settings and creates the default admin
# account, so it only runs when explicitly requested (first deployment).
if [ "$RUN_SEED" = "true" ]; then
  echo "RUN_SEED=true -> seeding database"
  npx ts-node prisma/seed.ts
fi

exec "$@"
