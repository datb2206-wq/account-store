import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { Money } from '@/components/money';
import { StatCard } from '@/components/stat-card';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { formatDate, localized } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.dashboard };
}

export default async function DashboardPage() {
  const user = await requireUser();
  const { locale, d } = await getI18n();
  const t = d.dashboard;

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
      <div>
        <h1 className="text-2xl font-semibold">{fmt(t.hi, { name: user.username ?? user.email.split('@')[0] ?? '' })}</h1>
        <p className="text-sm text-zinc-500">{fmt(t.memberSince, { date: formatDate(user.createdAt) })}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.balance} value={<Money value={user.balance} />} />
        <StatCard label={t.completedOrders} value={completed._count} />
        <StatCard label={t.totalSpent} value={<Money value={completed._sum.totalAmount} />} />
      </div>

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
                    <td className="tabular-nums"><Money value={o.totalAmount} /></td>
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
                      <Money value={tx.amount} />
                    </td>
                    <td><Badge value={tx.status} label={d.status[tx.status]} /></td>
                    <td className="text-zinc-500">{formatDate(tx.createdAt)}</td>
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
