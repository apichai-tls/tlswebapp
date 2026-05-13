#!/bin/sh

echo "Applying database schema changes..."
if npx prisma db push --skip-generate --accept-data-loss; then
  echo "Database schema updated successfully."
else
  echo "WARNING: Failed to apply database schema changes. Starting server anyway..."
fi

echo "Starting Next.js application on port ${PORT:-8080}..."
exec node server.js
