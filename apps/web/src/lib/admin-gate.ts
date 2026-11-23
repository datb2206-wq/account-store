// Link đăng nhập admin bí mật (Admin > Cài đặt bảo mật). Bật rồi thì:
//  - Vào /admin, gọi /api/admin/*, đăng nhập bằng tài khoản admin/nhân viên đều cần cookie "cổng"
//  - Cookie chỉ có được khi mở đúng link https://<web>/k/<mã> (mã ngẫu nhiên, chỉ super admin xem / đổi được)
//  - Không có cookie: /admin như không tồn tại, đăng nhập admin ở trang /login báo sai email/mật khẩu
// Mã để trống = tắt (như trước).
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';

export const GATE_COOKIE = 'az_ag';
export const GATE_PATH = '/k/';
const GATE_KEY = 'security.adminGate';
const MAX_AGE = 90 * 24 * 3600;
const TTL_MS = 30_000;

let cached: { token: string; at: number } | null = null;

export async function getGateToken() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.token;
  let token = '';
  try {
    const row = await prisma.systemConfig.findUnique({ where: { key: GATE_KEY } });
    const v = row?.value as { token?: unknown } | null;
    token = typeof v?.token === 'string' ? v.token : '';
  } catch {}
  cached = { token, at: Date.now() };
  return token;
}

export async function saveGateToken(token: string, userId: string) {
  await prisma.systemConfig.upsert({
    where: { key: GATE_KEY },
    update: { value: { token }, isSecret: true, updatedById: userId },
    create: { key: GATE_KEY, value: { token }, isSecret: true, updatedById: userId },
  });
  cached = null;
}

export const newGateToken = () => randomBytes(18).toString('base64url');

const cookieValue = (token: string) => createHmac('sha256', process.env.ENCRYPTION_KEY ?? '').update(`admin-gate:${token}`).digest('hex').slice(0, 40);

function matches(token: string, value: string | undefined) {
  if (!value) return false;
  const a = Buffer.from(cookieValue(token));
  const b = Buffer.from(value);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validGateToken(token: string, given: string) {
  const a = Buffer.from(token);
  const b = Buffer.from(given);
  return token.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** true = được vào khu admin (cổng đang tắt, hoặc trình duyệt có cookie đúng) */
export async function passedGate(cookieHeaderValue?: string) {
  const token = await getGateToken();
  if (!token) return true;
  const value = cookieHeaderValue ?? (await cookies()).get(GATE_COOKIE)?.value;
  return matches(token, value);
}

export function setGateCookie(res: NextResponse, token: string) {
  res.cookies.set(GATE_COOKIE, cookieValue(token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}
