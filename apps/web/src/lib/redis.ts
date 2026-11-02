import Redis from 'ioredis';

// Giống prisma: cache trên globalThis để hot-reload không mở thêm kết nối.
// Khởi tạo lazy để `next build` không cần Redis.
const globalForRedis = globalThis as unknown as { redis?: Redis };

export function getRedis() {
  if (!globalForRedis.redis) {
    const url = process.env.REDIS_URL;
    if (!url) throw new Error('REDIS_URL chưa được cấu hình trong .env');
    globalForRedis.redis = new Redis(url, { maxRetriesPerRequest: 3 });
  }
  return globalForRedis.redis;
}
