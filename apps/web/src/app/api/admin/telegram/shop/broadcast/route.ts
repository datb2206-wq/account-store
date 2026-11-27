import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { enqueueShopBroadcast, lastShopBroadcast, workerOnline } from '@/lib/queue';
import { getShopBotSettings, tg } from '@/lib/telegram-bot';

// Nội dung HTML của Telegram: chỉ cho các thẻ Telegram hỗ trợ
const ALLOWED = /<\/?(b|strong|i|em|u|s|code|pre|a)(\s+href="https?:\/\/[^"]*")?\s*>/gi;
const schema = z.object({ text: z.string().trim().min(1, 'Nhập nội dung').max(3500, 'Tối đa 3500 ký tự'), test: z.boolean().default(false) });

export const GET = adminRoute(async () => NextResponse.json({ last: await lastShopBroadcast() }), { superAdminOnly: true });

// Gửi thông báo tới mọi khách đã bấm Start bot. test = chỉ gửi thử cho Telegram của chính admin.
export const POST = adminRoute(
  async (req, _ctx, user) => {
    const input = await parseBody(req, schema);
    const leftover = input.text.replace(ALLOWED, '');
    if (/<[a-z/][^>]*>/i.test(leftover)) throw badRequest('Chỉ dùng được thẻ <b> <i> <u> <s> <code> <pre> <a href="https://...">');
    const shop = await getShopBotSettings();
    if (!shop.enabled || !shop.botToken) throw badRequest('Bot bán hàng chưa bật');

    if (input.test) {
      const me = await prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true } });
      if (!me?.telegramId) throw badRequest('Tài khoản admin này chưa gắn Telegram. Bấm Start bot bán hàng bằng link "Kết nối Telegram" ở trang tài khoản trước.');
      try {
        await tg(shop.botToken, 'sendMessage', { chat_id: me.telegramId, text: input.text, parse_mode: 'HTML', disable_web_page_preview: true });
      } catch (err) {
        throw badRequest(`Telegram từ chối: ${err instanceof Error ? err.message : err} (kiểm tra lại thẻ HTML / bạn đã bấm Start bot chưa)`);
      }
      return NextResponse.json({ ok: true, test: true });
    }

    const last = await lastShopBroadcast();
    if (last && !last.done && (last.state === 'active' || last.state === 'waiting' || last.state === 'delayed')) throw badRequest('Đợt gửi trước chưa xong, chờ gửi xong rồi gửi tiếp.');
    if (!(await workerOnline())) throw badRequest('Worker đang tắt nên chưa gửi được. Bật worker rồi thử lại.');
    const recipients = await prisma.user.count({ where: { telegramId: { not: null }, status: { not: 'BANNED' } } });
    if (!recipients) throw badRequest('Chưa có khách nào bấm Start bot.');
    const id = await enqueueShopBroadcast(input.text, user.id);
    await writeAudit({ actorId: user.id, action: 'telegram.shop.broadcast', entity: 'SystemConfig', entityId: 'telegram.shop', after: { recipients, length: input.text.length, preview: input.text.slice(0, 200) }, ip: getClientIp(req) });
    return NextResponse.json({ ok: true, id, recipients });
  },
  { superAdminOnly: true },
);
