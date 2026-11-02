import { PrismaClient } from '@prisma/client';

// Next.js dev server hot-reload sẽ tạo PrismaClient mới mỗi lần sửa code
// -> cạn connection pool. Cache instance trên globalThis để tránh việc đó.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';
