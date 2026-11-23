import { NextResponse, type NextRequest } from 'next/server';
import { getGateToken, setGateCookie, validGateToken } from '@/lib/admin-gate';
import { getClientIp } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

type Ctx = { params: Promise<{ token: string }> };

// Link đăng nhập admin bí mật: đúng mã -> ghi cookie "cổng" rồi sang trang đăng nhập; sai -> về trang chủ như link lạ
export async function GET(req: NextRequest, { params }: Ctx) {
  const { token: given } = await params;
  const home = NextResponse.redirect(new URL('/', req.url));
  const limit = await rateLimit(`admin-gate:${getClientIp(req)}`, 20, 15 * 60).catch(() => ({ ok: true }));
  if (!limit.ok) return home;
  const token = await getGateToken();
  if (!token || !validGateToken(token, given)) return home;
  const res = NextResponse.redirect(new URL('/login?next=/admin', req.url));
  setGateCookie(res, token);
  res.headers.set('Referrer-Policy', 'no-referrer');
  return res;
}
