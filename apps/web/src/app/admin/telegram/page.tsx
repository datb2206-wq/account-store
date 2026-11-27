import type { Metadata } from 'next';
import { getTelegramSettings, TELEGRAM_DEFAULTS, TELEGRAM_VARIABLES } from '@accszone/core';
import { prisma } from '@accszone/database';
import { PageHeader, Panel } from '@/components/admin/ui';
import { TelegramForm } from '@/components/admin/telegram-form';
import { ShopBotForm, ShopBroadcast, TelegramLinkButton } from '@/components/admin/telegram-bots';
import { lastShopBroadcast } from '@/lib/queue';
import { requireStaff } from '@/lib/auth';
import { getShopBotSettings, readBotLog } from '@/lib/telegram-bot';

export const metadata: Metadata = { title: 'Thông báo Telegram' };
export const dynamic = 'force-dynamic';

export default async function TelegramPage() {
  const user = await requireStaff();
  const superAdmin = user.role === 'SUPER_ADMIN';
  const [settings, shop, me, recipients, last, log] = await Promise.all([
    getTelegramSettings(),
    getShopBotSettings(),
    prisma.user.findUnique({ where: { id: user.id }, select: { telegramName: true, telegramId: true } }),
    prisma.user.count({ where: { telegramId: { not: null }, status: { not: 'BANNED' } } }),
    superAdmin ? lastShopBroadcast() : null,
    readBotLog('shop'),
  ]);
  const errors = log.filter((l) => l.error);
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

      {superAdmin && shop.enabled && <ShopBroadcast recipients={recipients} initialLast={last} />}

      <Panel title={`Nhật ký bot bán hàng (${log.length} lượt gần nhất · ${errors.length} lỗi)`} bodyClassName="p-0">
        {log.length === 0 ? (
          <p className="p-5 text-sm text-zinc-500">Chưa có lượt nào. Mỗi tin nhắn / nút bấm của khách được ghi ở đây (giữ 200 lượt gần nhất), lỗi tô đỏ.</p>
        ) : (
          <div className="max-h-[480px] overflow-auto">
            <table className="table text-xs">
              <thead>
                <tr><th>Thời gian</th><th>Khách (Telegram)</th><th>Loại</th><th>Nội dung</th><th className="text-right">Xử lý</th><th>Lỗi</th></tr>
              </thead>
              <tbody>
                {log.map((l, i) => (
                  <tr key={i} className={l.error ? 'bg-red-50' : ''}>
                    <td className="whitespace-nowrap text-zinc-500">{new Date(l.at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
                    <td className="font-mono whitespace-nowrap">{l.from}</td>
                    <td>{l.kind === 'btn' ? 'Bấm nút' : 'Tin nhắn'}</td>
                    <td className="max-w-60 truncate font-mono" title={l.data}>{l.data}</td>
                    <td className={`text-right tabular-nums ${l.ms > 5000 ? 'text-amber-600' : 'text-zinc-500'}`}>{(l.ms / 1000).toFixed(1)}s</td>
                    <td className="max-w-80 text-red-600">{l.error ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
