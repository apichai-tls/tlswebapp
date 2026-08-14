import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getPrismaUrl = () => {
  let url = process.env.DATABASE_URL || '';
  if (!url) return url;

  // Cloud Run: each instance handles up to 80 concurrent requests (default).
  // connection_limit=1 caused intermittent "Server Components render" errors
  // because a single connection can only serve one query at a time.
  // Using 5 connections per instance gives enough headroom without exhausting
  // the DB's max_connections (250) even with many scale-out instances.
  if (!url.includes('connection_limit=')) {
    url += (url.includes('?') ? '&' : '?') + 'connection_limit=5';
  }
  // Fail fast (10s) instead of hanging indefinitely when pool is full.
  if (!url.includes('pool_timeout=')) {
    url += '&pool_timeout=10';
  }
  // Drop idle connections after 60s to free DB slots when Cloud Run scales down.
  if (!url.includes('connect_timeout=')) {
    url += '&connect_timeout=10';
  }
  return url;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getPrismaUrl(),
      },
    },
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

