// File này chạy được cả ở Edge (middleware) lẫn Node — KHÔNG import prisma/redis ở đây.
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@accszone/database';

export const ACCESS_COOKIE = 'az_at';
export const REFRESH_COOKIE = 'az_rt';
export const ACCESS_TTL = 15 * 60; // 15 phút
export const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 ngày

const ISSUER = 'accszone';

// sid: mã phiên đăng nhập (giữ nguyên qua các lần refresh) -> chế độ "chỉ 1 thiết bị" (lib/session-guard.ts)
export interface AccessPayload {
  sub: string;
  role: Role;
  sid?: string;
}

export interface RefreshPayload {
  sub: string;
  jti: string;
  sid?: string;
}

function secret(name: 'JWT_ACCESS_SECRET' | 'JWT_REFRESH_SECRET') {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(`${name} chưa được cấu hình (cần >= 32 ký tự) trong .env`);
  }
  return new TextEncoder().encode(value);
}

export function signAccessToken({ sub, role, sid }: AccessPayload) {
  return new SignJWT(sid ? { role, sid } : { role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setAudience('access')
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .sign(secret('JWT_ACCESS_SECRET'));
}

export function signRefreshToken({ sub, jti, sid }: RefreshPayload) {
  return new SignJWT(sid ? { sid } : {})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setJti(jti)
    .setIssuer(ISSUER)
    .setAudience('refresh')
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL}s`)
    .sign(secret('JWT_REFRESH_SECRET'));
}

export async function verifyAccessToken(token: string): Promise<AccessPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret('JWT_ACCESS_SECRET'), {
      issuer: ISSUER,
      audience: 'access',
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.role !== 'string') return null;
    return { sub: payload.sub, role: payload.role as Role, sid: typeof payload.sid === 'string' ? payload.sid : undefined };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string): Promise<RefreshPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret('JWT_REFRESH_SECRET'), {
      issuer: ISSUER,
      audience: 'refresh',
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') return null;
    return { sub: payload.sub, jti: payload.jti, sid: typeof payload.sid === 'string' ? payload.sid : undefined };
  } catch {
    return null;
  }
}
