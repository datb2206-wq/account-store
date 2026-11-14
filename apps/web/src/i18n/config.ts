// Dùng được ở cả server lẫn client (không import gì của Node/Next server).
// Danh sách khớp enum Locale trong schema.prisma.
export const LOCALES = ['en', 'id', 'ru', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

// Cookie để server render đúng ngôn ngữ ngay từ request đầu; localStorage giữ bản sao
// phía trình duyệt (khôi phục lại cookie nếu bị xóa).
export const LOCALE_COOKIE = 'az_locale';
export const LOCALE_STORAGE_KEY = 'az_locale';
export const LOCALE_COOKIE_MAX_AGE = 365 * 24 * 3600;

export const LOCALE_META: Record<Locale, { name: string; short: string; htmlLang: string }> = {
  en: { name: 'English', short: 'EN', htmlLang: 'en' },
  id: { name: 'Bahasa Indonesia', short: 'ID', htmlLang: 'id' },
  ru: { name: 'Русский', short: 'RU', htmlLang: 'ru' },
  zh: { name: '中文', short: 'ZH', htmlLang: 'zh-CN' },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

// "Accept-Language: ru-RU,ru;q=0.9,en;q=0.8" -> 'ru'
export function matchAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  const tags = header
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag!.toLowerCase().split('-')[0], q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  return tags.map((t) => t.lang).find(isLocale) ?? null;
}

/** "Pay {amount}" + { amount: '$5' } -> "Pay $5" */
export function fmt(template: string, vars: Record<string, string | number> = {}) {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** Chuỗi có số nhiều: tiếng Anh one/other, tiếng Nga one/few/many/other. */
export interface Plural {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

export function plural(locale: Locale, n: number, forms: Plural) {
  const category = new Intl.PluralRules(LOCALE_META[locale].htmlLang).select(n) as keyof Plural;
  return fmt(forms[category] ?? forms.other, { n: n.toLocaleString('en-US') });
}

// Tiền tệ hiển thị tham khảo mặc định theo ngôn ngữ (khi khách chưa chọn và admin để "Tự động").
// Số dư & thanh toán luôn tính bằng USD; giá quy đổi chỉ hiện thêm dạng "≈". Tỷ giá: Admin > Tiền tệ.
export const LOCALE_CURRENCY: Record<Locale, string> = { en: 'USD', id: 'IDR', ru: 'RUB', zh: 'CNY' };

// decimals: số chữ số lẻ admin đặt cho tiền đó (Admin > Tiền tệ)
export type Fx = { currency: string; rate: number; decimals?: number } | null;

const fxFormatters = new Map<string, Intl.NumberFormat>();

export function formatFx(usd: number | string, fx: Fx, locale: Locale): string | null {
  if (!fx) return null;
  const digits = fx.decimals ?? (fx.currency === 'IDR' ? 0 : 2);
  const key = `${locale}:${fx.currency}:${digits}`;
  let f = fxFormatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE_META[locale].htmlLang, { style: 'currency', currency: fx.currency, minimumFractionDigits: 0, maximumFractionDigits: digits });
    fxFormatters.set(key, f);
  }
  return `≈ ${f.format(Number(usd) * fx.rate)}`;
}
