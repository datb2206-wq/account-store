// Chỉ dùng phía server (Route Handler / Server Component).
import { randomUUID } from 'node:crypto';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { NextResponse } from 'next/server';
import { prisma, type Role } from '@accszone/database';
import { ADMIN_LANDING_PAGES, canAccess } from './permissions';
import { getRedis } from './redis';
import {
  ACCESS_COOKIE,
  ACCESS_TTL,
  REFRESH_COOKIE,
  REFRESH_TTL,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
} from './jwt';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

// Refresh token hợp lệ khi jti còn trong Redis. Mỗi lần refresh -> xóa jti cũ, cấp jti mới
// (rotation). Token cũ bị đánh cắp sẽ không dùng lại được sau khi chủ thật đã refresh.
const refreshKey = (jti: string) => `auth:rt:${jti}`;

export async function createSession(user: { id: string; role: Role }): Promise<SessionTokens> {
  const jti = randomUUID();
  const [accessToken, refreshToken] = await Promise.all([
    signAccessToken({ sub: user.id, role: user.role }),
    signRefreshToken({ sub: user.id, jti }),
  ]);
  await getRedis().set(refreshKey(jti), user.id, 'EX', REFRESH_TTL);
  return { accessToken, refreshToken };
}

export async function rotateSession(refreshToken: string) {
  const payload = await verifyRefreshToken(refreshToken);
  if (!payload) return null;

  // GETDEL là atomic: 2 request refresh song song chỉ 1 cái thắng
  const owner = await getRedis().getdel(refreshKey(payload.jti));
  if (owner !== payload.sub) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, status: true },
  });
  if (!user || user.status === 'BANNED') return null;

  return { user, tokens: await createSession(user) };
}

export async function revokeSession(refreshToken: string) {
  const payload = await verifyRefreshToken(refreshToken);
  if (payload) await getRedis().del(refreshKey(payload.jti));
}

export function setAuthCookies(res: NextResponse, tokens: SessionTokens) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookies.set(ACCESS_COOKIE, tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: ACCESS_TTL,
  });
  // Refresh token chỉ gửi kèm request tới /api/auth/* -> giảm bề mặt lộ token
  res.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: REFRESH_TTL,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, '', { path: '/', maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, '', { path: '/api/auth', maxAge: 0 });
}

const userSelect = {
  id: true,
  email: true,
  username: true,
  role: true,
  status: true,
  balance: true,
  locale: true,
  currency: true,
  createdAt: true,
  lastLoginAt: true,
  adminRole: { select: { id: true, name: true, permissions: true } },
} as const;

// cache(): nhiều Server Component cùng gọi trong 1 request chỉ query DB 1 lần.
// Luôn đọc lại user từ DB -> user bị BANNED mất quyền ngay, không chờ access token hết hạn.
export const getCurrentUser = cache(async () => {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload) return null;

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: userSelect });
  if (!user || user.status === 'BANNED') return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

export const STAFF_ROLES: Role[] = ['STAFF', 'SUPER_ADMIN'];

// Trang admin: phải là nhân viên VÀ có quyền với trang đang mở (lib/permissions.ts).
// Middleware gắn header x-pathname cho mọi request /admin để biết trang đang mở.
export async function requireStaff() {
  const user = await requireUser();
  if (!STAFF_ROLES.includes(user.role)) redirect('/dashboard');
  const pathname = (await headers()).get('x-pathname');
  if (pathname && !canAccess(user, pathname)) {
    // Vào /admin mà không có quyền Dashboard -> chuyển tới trang đầu tiên được phép, thay vì báo lỗi
    const landing = pathname === '/admin' ? ADMIN_LANDING_PAGES.find((p) => canAccess(user, p)) : undefined;
    redirect(landing ?? '/admin/forbidden');
  }
  return user;
}
