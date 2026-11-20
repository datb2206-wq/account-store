import { NextResponse } from 'next/server';
import { getTelegramSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { badRequest, userRoute } from '@/lib/admin-route';
import { STAFF_ROLES } from '@/lib/auth';
import { tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { createLinkCode, getMe, getShopBotSettings } from '@/lib/telegram-bot';

// Tạo link kết nối Telegram 1 lần (10 phút): ?bot=shop (khách) hoặc ?bot=admin (nhân viên, bot Thông báo Telegram)
export const POST = userRoute(async (req, _ctx, user) => {
  const limit = await rateLimit(`tg:linkcode:${user.id}`, 10, 600);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const bot = req.nextUrl.searchParams.get('bot') === 'admin' ? 'admin' : 'shop';

  let username = '';
  if (bot === 'shop') {
    const s = await getShopBotSettings();
    if (!s.enabled || !s.botToken) throw badRequest('Bot Telegram chưa được bật');
    username = s.botUsername;
  } else {
    if (!STAFF_ROLES.includes(user.role)) throw badRequest('Chỉ dành cho quản trị viên');
    const s = await getTelegramSettings();
    if (!s.botToken || !s.adminCommands) throw badRequest('Hãy nhập Bot Token và bật "Nhận lệnh admin" rồi lưu trước');
    username = (await getMe(s.botToken).catch(() => null))?.username ?? '';
  }
  if (!username) throw badRequest('Không lấy được tên bot, kiểm tra lại Bot Token');
  const code = await createLinkCode(user.id);
  return NextResponse.json({ url: `https://t.me/${username}?start=${code}` });
});

// Ngắt kết nối Telegram khỏi tài khoản đang đăng nhập
export const DELETE = userRoute(async (_req, _ctx, user) => {
  await prisma.user.update({ where: { id: user.id }, data: { telegramId: null, telegramName: null } });
  return NextResponse.json({ ok: true });
});
