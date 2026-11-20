import type { Locale } from '@/i18n/config';
import { getShopBotSettings } from '@/lib/telegram-bot';

// Quảng bá bot khách hàng (Admin > Thông báo Telegram > Bot khách hàng): nút nổi + banner trang chủ.
// Tự ẩn khi bot tắt hoặc chưa có username.
export const TG_PROMO_TEXT: Record<Locale, { button: string; title: string; desc: string; open: string }> = {
  en: { button: 'Buy via Telegram', title: 'Shop on Telegram', desc: 'Buy and get your accounts instantly, 24/7, right inside Telegram.', open: 'Open bot' },
  id: { button: 'Beli via Telegram', title: 'Belanja di Telegram', desc: 'Beli dan terima akun secara instan, 24/7, langsung di Telegram.', open: 'Buka bot' },
  ru: { button: 'Купить в Telegram', title: 'Покупки в Telegram', desc: 'Покупайте и мгновенно получайте аккаунты 24/7 прямо в Telegram.', open: 'Открыть бота' },
  zh: { button: '通过 Telegram 购买', title: '在 Telegram 购物', desc: '在 Telegram 内直接购买，24/7 即时收到账户。', open: '打开机器人' },
  pt: { button: 'Comprar pelo Telegram', title: 'Compre pelo Telegram', desc: 'Compre e receba suas contas na hora, 24/7, direto no Telegram.', open: 'Abrir bot' },
};

export async function getShopBotLink() {
  const s = await getShopBotSettings();
  return s.enabled && s.botUsername ? `https://t.me/${s.botUsername}` : null;
}

export function TelegramIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M21.94 4.3a1.2 1.2 0 0 0-1.62-1.36L2.7 9.7c-1.2.47-1.19 1.15-.22 1.45l4.5 1.4 1.74 5.33c.21.58.1.81.71.81.47 0 .68-.21.94-.47l2.25-2.19 4.68 3.46c.86.47 1.48.23 1.7-.8l3.15-14.4Zm-4.2 3.07-8.4 7.58-.33 3.48-1.6-4.9 9.88-6.23c.46-.28.88-.13.45.07Z" />
    </svg>
  );
}

export async function TelegramBanner({ locale }: { locale: Locale }) {
  const href = await getShopBotLink();
  if (!href) return null;
  const t = TG_PROMO_TEXT[locale];
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex flex-col gap-3 rounded-xl bg-gradient-to-r from-[#229ed9] to-[#1c7fc0] p-4 text-white shadow-sm transition hover:brightness-105 sm:flex-row sm:items-center sm:p-5"
    >
      <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20">
        <TelegramIcon size={26} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-bold">🤖 {t.title}</span>
        <span className="mt-0.5 block text-sm text-white/90">{t.desc}</span>
      </span>
      <span className="self-start rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#1c7fc0] sm:self-auto">{t.open} →</span>
    </a>
  );
}
