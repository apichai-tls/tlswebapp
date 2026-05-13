#!/bin/sh

echo "Applying database schema changes..."
npx --yes prisma db push --skip-generate

echo "Starting Next.js application..."
exec node server.js
