import { after, NextResponse, type NextRequest } from 'next/server';
import { getTelegramSettings } from '@accszone/core';
import { handleAdminUpdate } from '@/lib/telegram-admin';
import { firstDelivery, getShopBotSettings, validWebhookSecret, type TgUpdate } from '@/lib/telegram-bot';
import { handleShopUpdate } from '@/lib/telegram-shop';

type Ctx = { params: Promise<{ bot: string }> };

// Telegram gọi webhook này cho mỗi tin nhắn / nút bấm. Trả 200 ngay, xử lý sau (after) để Telegram không gửi lại;
// update trùng (Telegram gửi lại) bị bỏ qua nhờ update_id.
export async function POST(req: NextRequest, { params }: Ctx) {
  const { bot } = await params;
  const secret = req.headers.get('x-telegram-bot-api-secret-token');
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update || typeof update.update_id !== 'number') return NextResponse.json({ ok: true });

  // URL gốc của web để gắn vào nút (nạp tiền, kết nối tài khoản). Nginx đặt sẵn X-Forwarded-Proto.
  const siteUrl = `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('host') ?? 'localhost'}`;

  if (bot === 'shop') {
    const settings = await getShopBotSettings();
    if (!settings.enabled || !validWebhookSecret(settings.botToken, secret)) return NextResponse.json({ ok: false }, { status: 401 });
    if (await firstDelivery('shop', update.update_id)) after(() => handleShopUpdate(update, settings, siteUrl));
    return NextResponse.json({ ok: true });
  }
  if (bot === 'admin') {
    const settings = await getTelegramSettings();
    if (!settings.adminCommands || !validWebhookSecret(settings.botToken, secret)) return NextResponse.json({ ok: false }, { status: 401 });
    if (await firstDelivery('admin', update.update_id)) after(() => handleAdminUpdate(update, settings));
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ ok: false }, { status: 404 });
}
