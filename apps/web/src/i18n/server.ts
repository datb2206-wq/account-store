// Chỉ dùng phía server (Server Component / generateMetadata / Route Handler).
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { getFx } from '@/lib/fx';
import { applyOverrides, getOverrides } from '@/lib/i18n-overrides';
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, matchAcceptLanguage, type Locale } from './config';
import { getDictionary } from './dictionaries';

// Thứ tự ưu tiên: cookie (khách vừa chọn) -> ngôn ngữ lưu trong tài khoản -> trình duyệt -> EN
export const getLocale = cache(async (): Promise<Locale> => {
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const user = await getCurrentUser();
  if (user && isLocale(user.locale)) return user.locale;

  return matchAcceptLanguage((await headers()).get('accept-language')) ?? DEFAULT_LOCALE;
});

// Từ điển = bản gốc trong code + bản dịch admin sửa trên web; fx = tiền tệ quy đổi tham khảo
export const getI18n = cache(async () => {
  const locale = await getLocale();
  const [overrides, fx] = await Promise.all([getOverrides(), getFx(locale)]);
  return { locale, d: applyOverrides(getDictionary(locale), overrides[locale]), fx };
});
