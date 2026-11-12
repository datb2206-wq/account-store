import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { Money } from '@/components/money';
import { Pagination } from '@/components/pagination';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { formatDate, localized } from '@/lib/format';
import { buildHref } from '@/lib/url';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.orders };
}

const PAGE_SIZE = 20;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { locale, d } = await getI18n();
  const page = Math.max(1, Number.parseInt((await searchParams).page ?? '1', 10) || 1);

  const [total, orders] = await Promise.all([
    prisma.order.count({ where: { userId: user.id } }),
    prisma.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
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
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{d.orders.title} <span className="text-base font-normal text-zinc-400">({total})</span></h1>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>{d.dashboard.colOrder}</th><th>{d.dashboard.colProduct}</th><th>{d.dashboard.colQty}</th><th>{d.dashboard.colTotal}</th><th>{d.dashboard.colStatus}</th><th>{d.dashboard.colDate}</th><th /></tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">
                  {d.orders.empty} <Link href="/" className="font-medium text-blue-600 hover:underline">{d.orders.browse}</Link>
                </td>
              </tr>
            )}
            {orders.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-xs">{o.code}</td>
                <td>{localized(o.product.name, locale)}</td>
                <td className="tabular-nums">{o.quantity}</td>
                <td className="tabular-nums"><Money value={o.totalAmount} /></td>
                <td><Badge value={o.status} label={d.status[o.status]} /></td>
                <td className="text-zinc-500">{formatDate(o.createdAt)}</td>
                <td className="text-right">
                  <Link href={`/dashboard/orders/${o.code}`} className="text-sm font-medium text-blue-600 hover:underline">{d.common.view}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        labels={d.common}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        hrefFor={(p) => buildHref('/dashboard/orders', { page: p > 1 ? p : undefined })}
      />
    </div>
  );
}
