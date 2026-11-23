// Chỉ dùng phía server (Server Component / generateMetadata / Route Handler).
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { getFx } from '@/lib/fx';
import { applyOverrides, getOverrides } from '@/lib/i18n-overrides';
import { getLanguages } from '@/lib/languages';
import { LOCALE_COOKIE, matchAcceptLanguage, type Locale } from './config';
import { getDictionary } from './dictionaries';

// Thứ tự ưu tiên: cookie (khách vừa chọn) -> ngôn ngữ lưu trong tài khoản -> trình duyệt -> EN
export const getLocale = cache(async (): Promise<Locale> => {
  // Chỉ nhận ngôn ngữ admin đang bật; không khớp -> ngôn ngữ mặc định admin chọn
  const { enabled, defaultLocale } = await getLanguages();
  const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (enabled as readonly string[]).includes(v);
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const user = await getCurrentUser();
  if (user && isLocale(user.locale)) return user.locale;

  return matchAcceptLanguage((await headers()).get('accept-language'), enabled) ?? defaultLocale;
});

// Từ điển = bản gốc trong code + bản dịch admin sửa trên web; fx = tiền tệ quy đổi tham khảo
export const getI18n = cache(async () => {
  const locale = await getLocale();
  const [overrides, fx, { enabled }] = await Promise.all([getOverrides(), getFx(locale), getLanguages()]);
  return { locale, locales: enabled, d: applyOverrides(getDictionary(locale), overrides[locale]), fx };
});
