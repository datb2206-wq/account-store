import { NextResponse, type NextRequest } from 'next/server';
import { getAffiliateSettings, REF_COOKIE } from '@accszone/core';

type Ctx = { params: Promise<{ code: string }> };

// Link giới thiệu: /r/MÃ -> nhớ mã trong cookie (hiệu lực theo cài đặt) rồi về trang chủ.
// Khách đăng ký trong thời gian đó sẽ được gắn với người giới thiệu. Không ghi đè mã đã có (người giới thiệu đầu tiên).
export async function GET(req: NextRequest, { params }: Ctx) {
  const code = (await params).code.trim().toUpperCase();
  const res = NextResponse.redirect(new URL('/', req.url));
  const settings = await getAffiliateSettings();
  if (settings.enabled && /^[A-Z0-9]{4,16}$/.test(code) && !req.cookies.get(REF_COOKIE)) {
    res.cookies.set(REF_COOKIE, code, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: settings.cookieDays * 86400 });
  }
  return res;
}
