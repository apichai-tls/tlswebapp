import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaSchemaRev?: string;
};

const CURRENT_SCHEMA_REV = 'whatsappId-v2';

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
  globalForPrisma.prisma && globalForPrisma.prismaSchemaRev === CURRENT_SCHEMA_REV
    ? globalForPrisma.prisma
    : new PrismaClient({
        datasources: {
          db: {
            url: getPrismaUrl(),
          },
        },
      });

globalForPrisma.prisma = prisma;
globalForPrisma.prismaSchemaRev = CURRENT_SCHEMA_REV;



