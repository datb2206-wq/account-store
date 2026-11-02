type DecimalLike = { toString(): string } | number | string | null | undefined;

// Tối đa 4 chữ số lẻ: giá sản phẩm đồng bộ từ nhà cung cấp được làm tròn tới 4 chữ số
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 });
const dateTime = new Intl.DateTimeFormat('en-GB', { dateStyle: 'short', timeStyle: 'short' });

// Chỉ dùng để HIỂN THỊ. Tính toán tiền phải dùng Prisma.Decimal, không dùng Number.
export function formatUsd(value: DecimalLike) {
  return usd.format(Number(value?.toString() ?? 0));
}

export function formatDate(value: Date | null | undefined) {
  return value ? dateTime.format(value) : '—';
}

// Số tiền theo đơn vị gốc: "25.0037 USDT", "500,000 VND"
export function formatOriginal(value: DecimalLike, currency: string | null | undefined) {
  if (value === null || value === undefined || !currency) return '—';
  if (currency === 'USDT') return `${value.toString()} USDT`;
  return `${Number(value.toString()).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${currency}`;
}

export const METHOD_LABEL: Record<string, string> = {
  USDT_TRC20: 'USDT · TRC20',
  USDT_BEP20: 'USDT · BEP20',
  BANK_TRANSFER: 'Bank transfer',
  BALANCE: 'Balance',
  MANUAL: 'Manual',
};

// Trường Json đa ngôn ngữ: { en: "...", ru: "..." } -> lấy theo locale, fallback en
export function localized(value: unknown, locale = 'en') {
  if (value && typeof value === 'object') {
    const map = value as Record<string, unknown>;
    const text = map[locale] ?? map.en ?? Object.values(map)[0];
    if (typeof text === 'string') return text;
  }
  return typeof value === 'string' ? value : '';
}
