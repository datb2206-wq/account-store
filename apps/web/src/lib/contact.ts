// Đổi giá trị liên hệ trong cấu hình thành link an toàn:
//   "https://…"        -> chính URL đó (chỉ http/https)
//   "me@shop.com"      -> mailto:
//   "@shop" / "shop"   -> https://t.me/shop
// Giá trị trống / không nhận ra -> null (giao diện sẽ mở widget hỗ trợ thay thế).
export function contactHref(value: string | undefined | null): string | null {
  const v = value?.trim() ?? '';
  if (!v) return null;
  if (/^https?:\/\/[^\s]+$/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  const tg = v.replace(/^@/, '');
  if (/^[A-Za-z0-9_]{4,32}$/.test(tg)) return `https://t.me/${tg}`;
  return null;
}
