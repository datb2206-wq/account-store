import { NextResponse } from 'next/server';
import { CONFIG_SCHEMAS, getTelegramSettings } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, readJson } from '@/lib/http';
import { syncShopCommands } from '@/lib/telegram-shop';
import { deleteWebhook, getMe, getShopBotSettings, setWebhook } from '@/lib/telegram-bot';

// Lưu bot khách hàng. Token để trống = giữ token cũ. Bật -> kiểm tra token (getMe) và đăng ký webhook với Telegram.
export const PUT = adminRoute(async (req, _ctx, user) => {
  const body = ((await readJson(req)) ?? {}) as { enabled?: boolean; botToken?: string; supportUrl?: string };
  const before = await getShopBotSettings();
  const botToken = body.botToken?.trim() || before.botToken;
  const parsed = CONFIG_SCHEMAS['telegram.shop'].safeParse({ enabled: !!body.enabled, botToken, botUsername: before.botUsername, supportUrl: body.supportUrl ?? '' });
  if (!parsed.success) throw badRequest(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
  const value = parsed.data;
  if (value.supportUrl && !/^https:\/\/\S+$/.test(value.supportUrl)) throw badRequest('Link hỗ trợ phải bắt đầu bằng https:// (VD https://t.me/ten_admin)');
  if (value.botToken && value.botToken === (await getTelegramSettings()).botToken) {
    throw badRequest('Bot khách hàng phải là bot KHÁC bot Thông báo / admin. Tạo thêm 1 bot mới ở @BotFather.');
  }

  if (value.enabled) {
    if (!value.botToken) throw badRequest('Nhập Bot Token của bot khách hàng');
    const me = await getMe(value.botToken).catch(() => null);
    if (!me) throw badRequest('Bot Token không đúng (Telegram từ chối). Copy lại token ở @BotFather.');
    value.botUsername = me.username;
    const site = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('host')}`;
    if (!site.startsWith('https://')) throw badRequest('Telegram chỉ gọi được web chạy HTTPS (tên miền thật).');
    try {
      await setWebhook(value.botToken, `${site}/api/webhooks/telegram/shop`);
      await syncShopCommands(value.botToken);
    } catch (err) {
      throw badRequest(`Không đăng ký được webhook: ${err instanceof Error ? err.message : err}`);
    }
  } else if (before.botToken) {
    await deleteWebhook(before.botToken);
  }
  if (before.botToken && before.botToken !== value.botToken) await deleteWebhook(before.botToken);

  await prisma.systemConfig.upsert({
    where: { key: 'telegram.shop' },
    update: { value: value as Prisma.InputJsonValue, updatedById: user.id },
    create: { key: 'telegram.shop', value: value as Prisma.InputJsonValue, isSecret: true, updatedById: user.id },
  });
  const mask = (v: typeof value) => ({ ...v, botToken: v.botToken ? '***' : '' });
  await writeAudit({ actorId: user.id, action: 'telegram.shop.update', entity: 'SystemConfig', entityId: 'telegram.shop', before: mask(before), after: mask(value), ip: getClientIp(req) });
  return NextResponse.json({ ok: true, botUsername: value.botUsername });
});
