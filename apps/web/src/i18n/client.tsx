'use client';

import { createContext, useContext } from 'react';
import { ACTIVE_LOCALES, DEFAULT_LOCALE, type Fx, type Locale } from './config';
import { en, type Dictionary } from './dictionaries/en';

// locales: ngôn ngữ admin đang bật (nút chọn ngôn ngữ, tab ngôn ngữ trong admin)
const I18nContext = createContext<{ locale: Locale; locales: readonly Locale[]; d: Dictionary; fx: Fx }>({ locale: DEFAULT_LOCALE, locales: ACTIVE_LOCALES, d: en, fx: null });

// Root layout truyền từ điển của ngôn ngữ hiện tại xuống -> Client Component không phải tải cả 4 bản
// fx: tiền tệ quy đổi tham khảo của ngôn ngữ hiện tại (null = chỉ hiện USD)
export function I18nProvider({ locale, locales, dictionary, fx, children }: { locale: Locale; locales: readonly Locale[]; dictionary: Dictionary; fx: Fx; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, locales, d: dictionary, fx }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
