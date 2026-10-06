import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const getPrismaUrl = () => {
  let url = process.env.DATABASE_URL || '';
  if (url && !url.includes('connection_limit=')) {
    url += (url.includes('?') ? '&' : '?') + 'connection_limit=15';
  }
  if (!url.includes('pool_timeout=')) {
    url += '&pool_timeout=20';
  }
  if (!url.includes('connect_timeout=')) {
    url += '&connect_timeout=15';
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

globalForPrisma.prisma = prisma;


