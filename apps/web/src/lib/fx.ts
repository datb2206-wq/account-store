// Tiền tệ hiển thị cho khách (giá quy đổi tham khảo "≈ ..."). Số dư & thanh toán luôn bằng USD.
// Nguồn: currency.rates (tỷ giá) + currency.display (tên, số lẻ, bật/tắt, tiền mặc định), nhớ 60 giây trong RAM.
// Tiền khách thấy, theo thứ tự ưu tiên: khách tự chọn (cookie) -> tiền mặc định admin đặt -> theo ngôn ngữ.
import { cookies } from 'next/headers';
import { getConfig } from '@accszone/core';
import { LOCALE_CURRENCY, type Fx, type Locale } from '@/i18n/config';

export const CURRENCY_COOKIE = 'az_currency';
const TTL_MS = 60_000;

// Tiền không dùng số lẻ: mặc định 0 chữ số khi admin chưa cấu hình
const ZERO_DECIMAL = new Set(['VND', 'IDR', 'JPY', 'KRW', 'CLP', 'PYG', 'UGX', 'KHR', 'LAK', 'MMK']);

export interface CurrencyInfo {
  code: string;
  name: string;
  rate: number;
  decimals: number;
  enabled: boolean;
}

export interface CurrencySettings {
  defaultCurrency: string; // "AUTO" | mã tiền tệ
  currencies: CurrencyInfo[]; // luôn có USD đứng đầu
}

let cached: { value: CurrencySettings; at: number } | null = null;

export function clearCurrencyCache() {
  cached = null;
}

// Gộp tỷ giá + cấu hình hiển thị. Tiền có tỷ giá nhưng chưa cấu hình -> hiện với tên = mã, đang bật.
export function mergeCurrencies(
  rates: Record<string, number>,
  display: { defaultCurrency: string; currencies: { code: string; name: string; decimals: number; enabled: boolean }[] } | null,
): CurrencySettings {
  const meta = new Map((display?.currencies ?? []).map((c) => [c.code, c]));
  const codes = ['USD', ...Object.keys(rates).filter((c) => c !== 'USD').sort()];
  const currencies = codes.map((code) => {
    const m = meta.get(code);
    return {
      code,
      name: m?.name ?? (code === 'USD' ? 'US Dollar' : code),
      rate: code === 'USD' ? 1 : rates[code]!,
      decimals: m?.decimals ?? (ZERO_DECIMAL.has(code) ? 0 : 2),
      enabled: code === 'USD' ? true : (m?.enabled ?? true),
    };
  });
  const def = display?.defaultCurrency ?? 'AUTO';
  return { defaultCurrency: def === 'AUTO' || currencies.some((c) => c.code === def) ? def : 'AUTO', currencies };
}

export async function getCurrencySettings(): Promise<CurrencySettings> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  let rates: Record<string, number> = { USD: 1 };
  let display = null;
  try {
    rates = await getConfig('currency.rates');
  } catch {} // cấu hình lỗi -> chỉ hiện USD, không làm hỏng trang
  try {
    display = await getConfig('currency.display');
  } catch {}
  const value = mergeCurrencies(rates, display);
  cached = { value, at: Date.now() };
  return value;
}

// Tiền tệ đang hiển thị cho khách. null = USD (không hiện giá quy đổi)
export async function getFx(locale: Locale): Promise<Fx> {
  const settings = await getCurrencySettings();
  const usable = (code: string | undefined) => settings.currencies.find((c) => c.code === code && c.enabled);
  const chosen = (await cookies()).get(CURRENCY_COOKIE)?.value;
  const pick =
    usable(chosen) ??
    (settings.defaultCurrency !== 'AUTO' ? usable(settings.defaultCurrency) : undefined) ??
    usable(LOCALE_CURRENCY[locale]);
  if (!pick || pick.code === 'USD') return null;
  return { currency: pick.code, rate: pick.rate, decimals: pick.decimals };
}

// Danh sách cho ô chọn tiền tệ của khách
export async function getCurrencyOptions() {
  const settings = await getCurrencySettings();
  return settings.currencies.filter((c) => c.enabled).map((c) => ({ code: c.code, name: c.name }));
}
