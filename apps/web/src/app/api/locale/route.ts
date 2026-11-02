import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@accszone/database';
import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from '@/i18n/config';
import { getCurrentUser } from '@/lib/auth';
import { isSameOrigin, jsonError, readJson } from '@/lib/http';

// Đổi ngôn ngữ: đặt cookie cho mọi khách; đã đăng nhập thì lưu luôn vào tài khoản
// (đăng nhập trên thiết bị khác vẫn giữ ngôn ngữ đã chọn).
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'Invalid origin');
  const body = (await readJson(req)) as { locale?: unknown } | null;
  const locale = body?.locale;
  if (!isLocale(locale)) return jsonError(400, 'Unsupported locale');

  const user = await getCurrentUser();
  if (user && user.locale !== locale) {
    await prisma.user.update({ where: { id: user.id }, data: { locale } });
  }

  const res = NextResponse.json({ locale });
  res.cookies.set(LOCALE_COOKIE, locale, { path: '/', maxAge: LOCALE_COOKIE_MAX_AGE, sameSite: 'lax' });
  return res;
}
