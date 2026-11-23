// Ngôn ngữ khách chọn được + ngôn ngữ mặc định (Admin > Ngôn ngữ > Ngôn ngữ hiển thị). Chưa cấu hình -> EN + PT, mặc định EN.
import { getConfig } from '@accszone/core';
import { ACTIVE_LOCALES, DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export interface LanguageSettings {
  enabled: Locale[];
  defaultLocale: Locale;
}

export const LANGUAGE_DEFAULTS: LanguageSettings = { enabled: [...ACTIVE_LOCALES], defaultLocale: DEFAULT_LOCALE };
const TTL_MS = 30_000;
let cached: { value: LanguageSettings; at: number } | null = null;

export function clearLanguageCache() {
  cached = null;
}

export async function getLanguages(): Promise<LanguageSettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let value = LANGUAGE_DEFAULTS;
  try {
    value = await getConfig('site.languages');
  } catch {}
  cached = { value, at: Date.now() };
  return value;
}
