import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Docker build đặt NEXT_OUTPUT=standalone -> .next/standalone chỉ chứa đúng các file cần chạy
  // (image nhỏ, không cần cài node_modules). Chạy bằng PM2/`next start` thì giữ build thường.
  output: process.env.NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  // Monorepo: trace file từ thư mục gốc để standalone gom cả packages/* và @prisma/client
  outputFileTracingRoot: path.join(__dirname, '../../'),
  // Engine của Prisma (.so.node) không được trace tự động khi @prisma/client nằm trong .pnpm
  // -> serverless (Vercel) báo "could not locate the Query Engine". Kèm thủ công cho mọi route.
  outputFileTracingIncludes: {
    '/**': ['../../node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client/*.node'],
  },
  // packages/core là TypeScript thuần (không build trước) -> Next tự biên dịch
  transpilePackages: ['@accszone/core'],
  // Không bundle package database: để Node require trực tiếp -> @prisma/client
  // được resolve từ packages/database (pnpm không hoist ra apps/web).
  serverExternalPackages: ['@accszone/database', 'ioredis', 'bullmq'],
};

export default nextConfig;
