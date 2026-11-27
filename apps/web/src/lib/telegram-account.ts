// Tài khoản tạo tự động khi khách bấm Start ở bot Telegram bán hàng (không cần đăng ký trên web).
// Email là địa chỉ giữ chỗ (không gửi được thư), tên đăng nhập tg_<Telegram ID>; khách tự đặt mật khẩu trong bot để đăng nhập web.
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@accszone/database';
import type { Locale } from '@/i18n/config';

export const TG_EMAIL_DOMAIN = 'telegram.invalid'; // .invalid: tên miền dành riêng, không bao giờ nhận thư
export const isTelegramPlaceholderEmail = (email: string) => email.endsWith(`@${TG_EMAIL_DOMAIN}`);
export const telegramUsername = (telegramId: number | string) => `tg_${telegramId}`;

export async function createTelegramAccount(telegramId: number, telegramName: string | null, locale: Locale) {
  const id = String(telegramId);
  // Mật khẩu ngẫu nhiên không ai biết: chưa đặt mật khẩu trong bot thì không đăng nhập web được
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('base64url'), 10);
  const create = (username: string | null) =>
    prisma.user.create({
      data: { email: `tg_${id}@${TG_EMAIL_DOMAIN}`, username, passwordHash, telegramId: id, telegramName, locale, emailOptOut: true },
      select: { id: true },
    });
  try {
    return await create(telegramUsername(id));
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') throw err;
    // 2 tin nhắn đến cùng lúc: tài khoản vừa được tạo ở request kia -> dùng lại
    const existing = await prisma.user.findUnique({ where: { telegramId: id }, select: { id: true } });
    if (existing) return existing;
    // Tên tg_<id> đã có người đăng ký trên web -> tạo không kèm tên đăng nhập
    return create(null).catch(() => prisma.user.findUnique({ where: { telegramId: id }, select: { id: true } }));
  }
}
