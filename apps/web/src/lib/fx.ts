// Tỷ giá cho giá quy đổi tham khảo (chỉ hiển thị). Đọc currency.rates, nhớ 60 giây trong RAM.
import { getConfig } from '@accszone/core';
import { LOCALE_CURRENCY, type Fx, type Locale } from '@/i18n/config';

const TTL_MS = 60_000;
let cached: { rates: Record<string, number>; at: number } | null = null;

async function loadRates() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.rates;
  try {
    cached = { rates: await getConfig('currency.rates'), at: Date.now() };
  } catch {
    cached = { rates: {}, at: Date.now() }; // cấu hình lỗi -> chỉ hiện USD, không làm hỏng trang
  }
  return cached.rates;
}

export async function getFx(locale: Locale): Promise<Fx> {
  const currency = LOCALE_CURRENCY[locale];
  if (currency === 'USD') return null;
  const rate = (await loadRates())[currency];
  return rate ? { currency, rate } : null;
}
