import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getCtvSettings } from '@accszone/core';
import { prisma } from '@accszone/database';
import { Money } from '@/components/money';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { localized } from '@/lib/format';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.seller.products };
}

const APPROVAL_TONE = { APPROVED: 'bg-emerald-50 text-emerald-700', PENDING: 'bg-amber-50 text-amber-700', REJECTED: 'bg-red-50 text-red-700' } as const;

export default async function SellerProductsPage() {
  const user = await requireUser();
  const [{ d, locale }, s, seller] = await Promise.all([getI18n(), getCtvSettings(), prisma.seller.findUnique({ where: { userId: user.id }, select: { id: true, status: true } })]);
  if (!s.enabled || seller?.status !== 'ACTIVE') redirect('/dashboard/seller');
  const t = d.seller;

  const products = await prisma.product.findMany({
    where: { sellerId: seller.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, price: true, isActive: true, approval: true, rejectReason: true, category: { select: { name: true } } },
  });
  const ids = products.map((p) => p.id);
  const [stock, sold] = await Promise.all([
    prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: ids }, status: 'AVAILABLE' }, _count: true }),
    prisma.order.groupBy({ by: ['productId'], where: { productId: { in: ids }, status: 'COMPLETED' }, _sum: { quantity: true } }),
  ]);
  const stockMap = new Map(stock.map((x) => [x.productId, x._count]));
  const soldMap = new Map(sold.map((x) => [x.productId, x._sum.quantity ?? 0]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/dashboard/seller" className="text-sm text-zinc-500 hover:underline">{t.back}</Link>
          <h1 className="mt-1 text-2xl font-semibold">{t.products}</h1>
        </div>
        <Link href="/dashboard/seller/products/new" className="btn-primary">+ {t.addProduct}</Link>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>{t.colProduct}</th><th>{t.colPrice}</th><th>{t.colStock}</th><th>{t.colSold}</th><th>{t.colStatus}</th><th /></tr></thead>
          <tbody>
            {products.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-500">{t.noProducts}</td></tr>}
            {products.map((p) => (
              <tr key={p.id}>
                <td className="max-w-md">
                  <p className="font-medium">{localized(p.name, locale)}</p>
                  <p className="text-xs text-zinc-400">{localized(p.category.name, locale)}</p>
                </td>
                <td className="tabular-nums"><Money value={p.price} /></td>
                <td className={`tabular-nums ${(stockMap.get(p.id) ?? 0) === 0 ? 'text-red-600' : ''}`}>{(stockMap.get(p.id) ?? 0).toLocaleString('en-US')}</td>
                <td className="tabular-nums">{(soldMap.get(p.id) ?? 0).toLocaleString('en-US')}</td>
                <td className="space-y-1">
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${APPROVAL_TONE[p.approval]}`}>{t[`approval${p.approval}`]}</span>
                  {p.approval === 'APPROVED' && <span className="ml-1 text-xs text-zinc-500">{p.isActive ? t.active : t.hidden}</span>}
                  {p.approval === 'REJECTED' && p.rejectReason && <p className="text-xs text-red-600">{fmt(t.rejectedReason, { reason: p.rejectReason })}</p>}
                </td>
                <td className="text-right"><Link href={`/dashboard/seller/products/${p.id}`} className="text-sm font-medium text-blue-600 hover:underline">{t.edit}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
