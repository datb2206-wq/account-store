import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { decrypt } from '@accszone/core';
import { Badge } from '@/components/badge';
import { Money } from '@/components/money';
import { Pagination } from '@/components/pagination';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { formatDate, localized } from '@/lib/format';
import { buildHref } from '@/lib/url';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.orders };
}

const PAGE_SIZE = 20;
// Đơn tới INLINE_MAX tài khoản: hiện thẳng trong bảng. Nhiều hơn: gom thành 1 file, bấm để mở.
const INLINE_MAX = 3;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await requireUser();
  const { locale, d } = await getI18n();
  const t = d.orders;
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
        // Chỉ cần đủ để hiện trong bảng; đơn lớn mở bằng file
        stockItems: { where: { status: 'SOLD' }, select: { content: true }, orderBy: { soldAt: 'asc' }, take: INLINE_MAX + 1 },
        _count: { select: { stockItems: { where: { status: 'SOLD' } } } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t.title} <span className="text-base font-normal text-zinc-400">({total})</span></h1>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>{t.colDateTime}</th>
              <th>{d.dashboard.colProduct}</th>
              <th>{d.dashboard.colQty}</th>
              <th>{d.dashboard.colTotal}</th>
              <th>{t.colAccounts}</th>
              <th>{d.dashboard.colStatus}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-zinc-500">
                  {t.empty} <Link href="/" className="font-medium text-blue-600 hover:underline">{t.browse}</Link>
                </td>
              </tr>
            )}
            {orders.map((o) => {
              const count = o._count.stockItems;
              return (
                <tr key={o.id} className="align-top">
                  <td className="whitespace-nowrap">
                    <p className="text-zinc-900">{formatDate(o.createdAt)}</p>
                    <p className="font-mono text-xs text-zinc-400">{o.code}</p>
                  </td>
                  <td className="min-w-48">{localized(o.product.name, locale)}</td>
                  <td className="tabular-nums">{o.quantity}</td>
                  <td className="tabular-nums"><Money value={o.totalAmount} /></td>
                  <td className="max-w-md">
                    {count === 0 ? (
                      <span className="text-sm text-zinc-400">{o.status === 'PENDING' ? t.accountsPending : '—'}</span>
                    ) : count <= INLINE_MAX ? (
                      <ul className="space-y-1">
                        {o.stockItems.map((s, i) => (
                          <li key={i} className="rounded bg-zinc-50 px-2 py-1 font-mono text-xs break-all text-zinc-800 select-all">{decrypt(s.content)}</li>
                        ))}
                      </ul>
                    ) : (
                      <a
                        href={`/api/orders/${o.code}/download?view=1`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:border-blue-300 hover:bg-blue-50"
                      >
                        <span aria-hidden>📄</span>
                        <span>
                          <span className="block font-medium text-blue-700">{o.code}.txt</span>
                          <span className="block text-xs text-zinc-500">{fmt(t.fileCount, { n: count })}</span>
                        </span>
                      </a>
                    )}
                  </td>
                  <td><Badge value={o.status} label={t.status[o.status] ?? d.status[o.status]} /></td>
                  <td className="text-right">
                    <Link href={`/dashboard/orders/${o.code}`} className="text-sm font-medium text-blue-600 hover:underline">{d.common.view}</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-400">{t.keepPrivate}</p>

      <Pagination
        labels={d.common}
        page={page}
        totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        hrefFor={(p) => buildHref('/dashboard/orders', { page: p > 1 ? p : undefined })}
      />
    </div>
  );
}
