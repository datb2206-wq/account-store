// API key cho khách mua hàng qua API (trang Tài liệu API, bot Telegram).
// DB lưu SHA-256 của key để tra cứu + bản mã hóa để khách xem lại; key dạng ak_<32 ký tự>.
import { createHash, randomBytes } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { decrypt, encrypt } from '@accszone/core';
import { prisma } from '@accszone/database';
import { rateLimit } from './rate-limit';
import { getSiteConfig } from './site';

export const API_KEY_RE = /^ak_[A-Za-z0-9_-]{32}$/;
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

export async function regenerateApiKey(userId: string) {
  const key = `ak_${randomBytes(24).toString('base64url')}`;
  await prisma.user.update({ where: { id: userId }, data: { apiKeyHash: hashApiKey(key), apiKeyEnc: encrypt(key) } });
  return key;
}

// Key hiện tại của khách; create = chưa có thì tạo mới
export async function getApiKey(userId: string, create = false) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { apiKeyEnc: true } });
  if (u?.apiKeyEnc) {
    try {
      return decrypt(u.apiKeyEnc);
    } catch {}
  }
  return create ? regenerateApiKey(userId) : null;
}

export async function userByApiKey(key: string) {
  if (!API_KEY_RE.test(key)) return null;
  return prisma.user.findUnique({
    where: { apiKeyHash: hashApiKey(key) },
    select: { id: true, email: true, username: true, status: true, role: true, balance: true, telegramId: true },
  });
}

export function apiKeyFromRequest(req: NextRequest) {
  const header = req.headers.get('x-api-key') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? '';
  return (header || req.nextUrl.searchParams.get('api_key') || '').trim();
}

// ---------------------------------------------------------------- Trả lời API dạng { success, data } / { success: false, error }
export const apiOk = (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status, headers: { 'Cache-Control': 'no-store' } });
export const apiFail = (status: number, error: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ success: false, error, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } });

export type ApiUser = NonNullable<Awaited<ReturnType<typeof userByApiKey>>>;

// Xác thực request API: key hợp lệ, tài khoản không bị khóa, không bảo trì, giới hạn 120 request/phút mỗi key
export async function authApi(req: NextRequest): Promise<{ user: ApiUser } | { res: NextResponse }> {
  const key = apiKeyFromRequest(req);
  if (!key) return { res: apiFail(401, 'Missing API key (header X-API-Key)') };
  const user = await userByApiKey(key);
  if (!user) return { res: apiFail(401, 'Invalid API key') };
  if (user.status !== 'ACTIVE') return { res: apiFail(403, 'Account suspended') };
  if (user.role === 'USER' && (await getSiteConfig()).maintenance) return { res: apiFail(503, 'Store under maintenance') };
  const limit = await rateLimit(`api:v1:${user.id}`, 120, 60).catch(() => ({ ok: true as const, retryAfter: 0 }));
  if (!limit.ok) return { res: NextResponse.json({ success: false, error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } }) };
  return { user };
}
