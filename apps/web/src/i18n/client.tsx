'use client';

import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, type Fx, type Locale } from './config';
import { en, type Dictionary } from './dictionaries/en';

const I18nContext = createContext<{ locale: Locale; d: Dictionary; fx: Fx }>({ locale: DEFAULT_LOCALE, d: en, fx: null });

// Root layout truyền từ điển của ngôn ngữ hiện tại xuống -> Client Component không phải tải cả 4 bản
// fx: tiền tệ quy đổi tham khảo của ngôn ngữ hiện tại (null = chỉ hiện USD)
export function I18nProvider({ locale, dictionary, fx, children }: { locale: Locale; dictionary: Dictionary; fx: Fx; children: React.ReactNode }) {
  return <I18nContext.Provider value={{ locale, d: dictionary, fx }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
