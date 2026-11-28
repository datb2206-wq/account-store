import type { Metadata } from 'next';
import Link from 'next/link';
import { getAffiliateSettings, getCtvSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { LocalTime } from '@/components/local-time';
import { LocalMoney } from '@/components/money';
import { StatCard } from '@/components/stat-card';
import { fmt } from '@/i18n/config';
import { rich } from '@/i18n/rich';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { localized } from '@/lib/format';
import { TelegramLinkButton } from '@/components/admin/telegram-bots';
import { getShopBotSettings } from '@/lib/telegram-bot';

// Thẻ "Kết nối Telegram" (bot khách hàng)
const TG_TEXT = {
  en: { title: 'Telegram bot', desc: 'Buy and receive accounts right in Telegram with your balance.', connect: '🔗 Connect Telegram', reconnect: '🔗 Reconnect', disconnect: 'Disconnect', linked: 'Connected:', open: 'Open bot' },
  id: { title: 'Bot Telegram', desc: 'Beli dan terima akun langsung di Telegram dengan saldo Anda.', connect: '🔗 Hubungkan Telegram', reconnect: '🔗 Hubungkan ulang', disconnect: 'Putuskan', linked: 'Terhubung:', open: 'Buka bot' },
  ru: { title: 'Telegram-бот', desc: 'Покупайте и получайте аккаунты прямо в Telegram с баланса.', connect: '🔗 Подключить Telegram', reconnect: '🔗 Переподключить', disconnect: 'Отключить', linked: 'Подключено:', open: 'Открыть бота' },
  zh: { title: 'Telegram 机器人', desc: '在 Telegram 中直接用余额购买并接收账户。', connect: '🔗 绑定 Telegram', reconnect: '🔗 重新绑定', disconnect: '解绑', linked: '已绑定：', open: '打开机器人' },
  pt: { title: 'Bot do Telegram', desc: 'Compre e receba contas direto no Telegram usando seu saldo.', connect: '🔗 Conectar Telegram', reconnect: '🔗 Reconectar', disconnect: 'Desconectar', linked: 'Conectado:', open: 'Abrir bot' },
} as const;

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.dashboard };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { locale, d, fx } = await getI18n();
  const t = d.dashboard;
  const affiliateOn = (await getAffiliateSettings()).enabled;
  // Kênh CTV: hiện khi đang mở đăng ký, hoặc user đã là CTV
  const ctv = await getCtvSettings();
  const sellerOn = ctv.enabled && (ctv.allowApply || !!(await prisma.seller.findUnique({ where: { userId: user.id }, select: { id: true } })));

  const shopBot = await getShopBotSettings();
  const tgUser = shopBot.enabled ? await prisma.user.findUnique({ where: { id: user.id }, select: { telegramId: true, telegramName: true } }) : null;
  const tg = TG_TEXT[locale];
  const [completed, recentOrders, recentTxs] = await Promise.all([
    prisma.order.aggregate({
      where: { userId: user.id, status: 'COMPLETED' },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        code: true,
        quantity: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        product: { select: { name: true } },
      },
    }),
    prisma.transaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, type: true, method: true, status: true, amount: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{fmt(t.hi, { name: user.username ?? user.email.split('@')[0] ?? '' })}</h1>
        <p className="text-sm text-zinc-500">{rich(t.memberSince, { date: <LocalTime value={user.createdAt} /> })}</p>
      </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/api" className="btn-ghost border border-zinc-200">🔑 API</Link>
          {affiliateOn && <Link href="/dashboard/affiliate" className="btn-ghost border border-zinc-200">🎁 {d.affiliate.menu}</Link>}
          {sellerOn && <Link href="/dashboard/seller" className="btn-ghost border border-zinc-200">🏪 {d.seller.menu}</Link>}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.balance} value={<LocalMoney value={user.balance} fx={fx} locale={locale} />} />
        <StatCard label={t.completedOrders} value={completed._count} />
        <StatCard label={t.totalSpent} value={<LocalMoney value={completed._sum.totalAmount} fx={fx} locale={locale} />} />
      </div>

      {shopBot.enabled && shopBot.botUsername && (
        <section id="telegram" className="card flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">✈️ {tg.title}</h2>
            <p className="text-sm text-zinc-500">{tg.desc} <a className="text-indigo-600 hover:underline" href={`https://t.me/${shopBot.botUsername}`} target="_blank" rel="noreferrer">@{shopBot.botUsername}</a></p>
          </div>
          <TelegramLinkButton bot="shop" linkedName={tgUser?.telegramId ? (tgUser.telegramName ?? tgUser.telegramId) : null} labels={tg} />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">{t.recentOrders}</h2>
          {recentOrders.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">{t.noOrders}</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>{t.colOrder}</th><th>{t.colProduct}</th><th>{t.colTotal}</th><th>{t.colStatus}</th></tr>
              </thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td><Link href={`/dashboard/orders/${o.code}`} className="font-mono text-xs text-blue-600 hover:underline">{o.code}</Link></td>
                    <td>{localized(o.product.name, locale)} × {o.quantity}</td>
                    <td className="tabular-nums"><LocalMoney value={o.totalAmount} fx={fx} locale={locale} /></td>
                    <td><Badge value={o.status} label={d.orders.status[o.status] ?? d.status[o.status]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-3 font-semibold">{t.recentTx}</h2>
          {recentTxs.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">{t.noTx}</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>{t.colType}</th><th>{t.colAmount}</th><th>{t.colStatus}</th><th>{t.colDate}</th></tr>
              </thead>
              <tbody>
                {recentTxs.map((tx) => (
                  <tr key={tx.id}>
                    <td>{d.txType[tx.type] ?? tx.type}</td>
                    <td className={`tabular-nums ${tx.amount.isNegative() ? 'text-red-600' : 'text-emerald-600'}`}>
                      <LocalMoney value={tx.amount} fx={fx} locale={locale} />
                    </td>
                    <td><Badge value={tx.status} label={d.status[tx.status]} /></td>
                    <td className="text-zinc-500"><LocalTime value={tx.createdAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
