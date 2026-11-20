import type { Metadata } from 'next';
import { getTelegramSettings, TELEGRAM_DEFAULTS, TELEGRAM_VARIABLES } from '@accszone/core';
import { prisma } from '@accszone/database';
import { PageHeader, Panel } from '@/components/admin/ui';
import { TelegramForm } from '@/components/admin/telegram-form';
import { ShopBotForm, TelegramLinkButton } from '@/components/admin/telegram-bots';
import { requireStaff } from '@/lib/auth';
import { getShopBotSettings } from '@/lib/telegram-bot';

export const metadata: Metadata = { title: 'Thông báo Telegram' };
export const dynamic = 'force-dynamic';

export default async function TelegramPage() {
  const user = await requireStaff();
  const [settings, shop, me] = await Promise.all([
    getTelegramSettings(),
    getShopBotSettings(),
    prisma.user.findUnique({ where: { id: user.id }, select: { telegramName: true, telegramId: true } }),
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Thông báo Telegram" />
      <p className="text-sm text-zinc-500">Bot gửi tin vào Telegram của bạn (hoặc nhóm) khi có đơn hàng, nạp tiền, hoàn tiền, hay nguồn API sắp hết tiền.</p>
      {/* Không gửi Bot Token xuống trình duyệt */}
      <TelegramForm initial={{ ...settings, botToken: '' }} hasToken={!!settings.botToken} variables={TELEGRAM_VARIABLES} defaults={TELEGRAM_DEFAULTS.templates} />

      <Panel title="Kết nối Telegram của tôi (bot admin)" bodyClassName="space-y-3 p-5">
        <p className="text-sm text-zinc-500">
          Gắn Telegram của bạn vào tài khoản admin này để ra lệnh cho bot admin. Cần bật &quot;Nhận lệnh admin&quot; và lưu ở trên trước. Mỗi nhân viên tự kết nối bằng tài khoản của mình.
        </p>
        <TelegramLinkButton bot="admin" linkedName={me?.telegramId ? (me.telegramName ?? me.telegramId) : null} />
      </Panel>

      <ShopBotForm initial={{ enabled: shop.enabled, botUsername: shop.botUsername, supportUrl: shop.supportUrl }} hasToken={!!shop.botToken} />
    </div>
  );
}
