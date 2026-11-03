import { getRedis } from './redis';

// Fixed-window counter: đủ dùng để chặn brute-force đăng nhập / spam đăng ký / spam tạo đơn nạp.
// INCR + EXPIRE chạy trong 1 MULTI: tiến trình chết giữa chừng không để lại khóa vĩnh viễn (chặn người dùng mãi mãi).
// EXPIRE NX (Redis >= 7) chỉ đặt hạn ở lần đếm đầu, các lần sau không kéo dài cửa sổ.
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const redisKey = `rl:${key}`;
  const res = await getRedis().multi().incr(redisKey).expire(redisKey, windowSec, 'NX').ttl(redisKey).exec();
  const count = Number(res?.[0]?.[1] ?? 0);
  if (!res || res.some(([err]) => err)) throw new Error('Rate limit: Redis MULTI failed');

  if (count <= limit) return { ok: true as const };
  const ttl = Number(res[2]?.[1] ?? -1);
  return { ok: false as const, retryAfter: ttl > 0 ? ttl : windowSec };
}

export async function resetRateLimit(key: string) {
  await getRedis().del(`rl:${key}`);
}
