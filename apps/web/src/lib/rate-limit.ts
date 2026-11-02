import { getRedis } from './redis';

// Fixed-window counter: đủ dùng để chặn brute-force đăng nhập / spam đăng ký.
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const redis = getRedis();
  const redisKey = `rl:${key}`;
  const count = await redis.incr(redisKey);
  if (count === 1) await redis.expire(redisKey, windowSec);

  if (count <= limit) return { ok: true as const };
  const ttl = await redis.ttl(redisKey);
  return { ok: false as const, retryAfter: ttl > 0 ? ttl : windowSec };
}

export async function resetRateLimit(key: string) {
  await getRedis().del(`rl:${key}`);
}
