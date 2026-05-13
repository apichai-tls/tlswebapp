#!/bin/sh
set -e

echo "Applying database schema changes..."
npx prisma db push --skip-generate --accept-data-loss

echo "Starting Next.js application on port ${PORT}..."
exec node server.js
