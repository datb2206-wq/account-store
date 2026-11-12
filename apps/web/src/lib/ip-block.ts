// Chặn IP (Admin > Block IP). Kiểm tra ở các API quan trọng: đăng nhập, đăng ký, mua hàng, nạp tiền.
import { prisma } from '@accszone/database';
import { jsonError } from './http';
import { rateLimit, resetRateLimit } from './rate-limit';
import { getRedis } from './redis';

// Đăng nhập sai AUTO_BLOCK_ATTEMPTS lần trong 15 phút từ cùng 1 IP -> tự chặn IP đó AUTO_BLOCK_HOURS giờ
export const AUTO_BLOCK_ATTEMPTS = 5;
const AUTO_BLOCK_HOURS = 24;
const CACHE_SEC = 60;
const cacheKey = (ip: string) => `ipblock:${ip}`;

export const IP_BLOCKED_ERROR = 'Access from your IP address has been blocked';

export async function isIpBlocked(ip: string) {
  if (!ip || ip === 'unknown') return false;
  const redis = getRedis();
  const cached = await redis.get(cacheKey(ip)).catch(() => null);
  if (cached !== null) return cached === '1';
  const hit = await prisma.blockedIp.findFirst({
    where: { ip, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { id: true },
  });
  await redis.set(cacheKey(ip), hit ? '1' : '0', 'EX', CACHE_SEC).catch(() => null);
  return !!hit;
}

/** Trả về Response 403 nếu IP bị chặn, null nếu cho qua */
export async function blockedIpResponse(ip: string) {
  return (await isIpBlocked(ip)) ? jsonError(403, IP_BLOCKED_ERROR) : null;
}

/** Xóa cache sau khi admin thêm / gỡ chặn để có hiệu lực ngay */
export async function clearIpBlockCache(ip: string) {
  await getRedis().del(cacheKey(ip)).catch(() => null);
}

/** Gọi khi đăng nhập sai mật khẩu. Trả về true nếu IP vừa bị tự động chặn. */
export async function recordFailedLogin(ip: string) {
  if (!ip || ip === 'unknown') return false;
  const r = await rateLimit(`loginfail:ip:${ip}`, AUTO_BLOCK_ATTEMPTS - 1, 15 * 60);
  if (r.ok) return false;
  await prisma.blockedIp.upsert({
    where: { ip },
    create: { ip, reason: 'Đăng nhập thất bại quá nhiều lần', attempts: AUTO_BLOCK_ATTEMPTS, expiresAt: new Date(Date.now() + AUTO_BLOCK_HOURS * 3_600_000) },
    update: { reason: 'Đăng nhập thất bại quá nhiều lần', attempts: { increment: AUTO_BLOCK_ATTEMPTS }, expiresAt: new Date(Date.now() + AUTO_BLOCK_HOURS * 3_600_000) },
  });
  await Promise.all([clearIpBlockCache(ip), resetRateLimit(`loginfail:ip:${ip}`)]);
  return true;
}
