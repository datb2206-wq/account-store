import { NextResponse, type NextRequest } from 'next/server';
import { clearAuthCookies, rotateSession, setAuthCookies } from '@/lib/auth';
import { GATE_COOKIE, passedGate } from '@/lib/admin-gate';
import { jsonError } from '@/lib/http';
import { REFRESH_COOKIE } from '@/lib/jwt';
import { safeNext } from '@/lib/safe-next';

async function rotate(req: NextRequest) {
  const token = req.cookies.get(REFRESH_COOKIE)?.value;
  return token ? rotateSession(token) : null;
}

// Gọi từ client (fetch) khi API trả 401
export async function POST(req: NextRequest) {
  const session = await rotate(req);
  if (!session) {
    const res = jsonError(401, 'Session expired');
    clearAuthCookies(res);
    return res;
  }
  const res = NextResponse.json({ ok: true });
  setAuthCookies(res, session.tokens);
  return res;
}

// Middleware redirect tới đây khi access token hết hạn: refresh xong quay lại trang cũ
export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get('next')) ?? '/dashboard';
  const session = await rotate(req);

  if (!session) {
    // Chưa mở link đăng nhập admin bí mật mà gõ /admin -> về trang chủ, không lộ trang đăng nhập admin
    if (next.startsWith('/admin') && !(await passedGate(req.cookies.get(GATE_COOKIE)?.value ?? ''))) {
      return NextResponse.redirect(new URL('/', req.url));
    }
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', next);
    const res = NextResponse.redirect(loginUrl);
    clearAuthCookies(res);
    return res;
  }
  const res = NextResponse.redirect(new URL(next, req.url));
  setAuthCookies(res, session.tokens);
  return res;
}
