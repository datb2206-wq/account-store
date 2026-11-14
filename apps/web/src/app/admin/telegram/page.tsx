import type { Metadata } from 'next';
import { getTelegramSettings, TELEGRAM_DEFAULTS, TELEGRAM_VARIABLES } from '@accszone/core';
import { PageHeader } from '@/components/admin/ui';
import { TelegramForm } from '@/components/admin/telegram-form';
import { requireStaff } from '@/lib/auth';

export const metadata: Metadata = { title: 'Thông báo Telegram' };
export const dynamic = 'force-dynamic';

export default async function TelegramPage() {
  await requireStaff();
  const settings = await getTelegramSettings();
  return (
    <div className="space-y-5">
      <PageHeader title="Thông báo Telegram" />
      <p className="text-sm text-zinc-500">Bot gửi tin vào Telegram của bạn (hoặc nhóm) khi có đơn hàng, nạp tiền, hoàn tiền, hay nguồn API sắp hết tiền.</p>
      {/* Không gửi Bot Token xuống trình duyệt */}
      <TelegramForm initial={{ ...settings, botToken: '' }} hasToken={!!settings.botToken} variables={TELEGRAM_VARIABLES} defaults={TELEGRAM_DEFAULTS.templates} />
    </div>
  );
}
