#!/bin/sh

if [ "${RUN_DB_MIGRATE_ON_BOOT}" = "true" ]; then
  echo "RUN_DB_MIGRATE_ON_BOOT=true: Applying database schema changes..."
  if npx prisma db push --skip-generate; then
    echo "Database schema updated successfully."
    echo "Running migration script..."
    npx tsx scripts/migrate_statuses.ts || echo "WARNING: Migration script failed."
  else
    echo "WARNING: Failed to apply database schema changes. Starting server anyway..."
  fi
else
  echo "Skipping runtime schema push on container boot (set RUN_DB_MIGRATE_ON_BOOT=true to enable)."
fi

echo "Starting Next.js application on port ${PORT:-8080}..."
exec node server.js
