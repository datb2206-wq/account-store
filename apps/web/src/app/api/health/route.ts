import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { getRedis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

// Docker healthcheck / uptime monitor: 200 khi kết nối được cả PostgreSQL và Redis.
export async function GET() {
  const [db, redis] = await Promise.all([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    getRedis().ping().then(() => true, () => false),
  ]);
  const ok = db && redis;
  return NextResponse.json({ ok, db, redis }, { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
