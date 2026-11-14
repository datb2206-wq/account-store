import type { Metadata } from 'next';
import Link from 'next/link';
import { getCtvSettings, releaseSellerEarnings, sellerFee } from '@accszone/core';
import { prisma } from '@accszone/database';
import { LocalTime } from '@/components/local-time';
import { Money } from '@/components/money';
import { fmt } from '@/i18n/config';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { localized } from '@/lib/format';
import { ApplyForm, SellerWithdrawForm } from './seller-client';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.seller.title };
}

const TONE: Record<string, string> = {
  HOLD: 'bg-amber-50 text-amber-700',
  AVAILABLE: 'bg-emerald-50 text-emerald-700',
  REVERSED: 'bg-zinc-100 text-zinc-500',
  PENDING: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  REJECTED: 'bg-red-50 text-red-700',
};

export default async function SellerPage() {
  const user = await requireUser();
  const [{ d, locale }, s, seller] = await Promise.all([getI18n(), getCtvSettings(), prisma.seller.findUnique({ where: { userId: user.id } })]);
  const t = d.seller;
  const keep = (v: number) => (100 - v).toString();

  const header = (
    <div>
      <Link href="/dashboard" className="text-sm text-zinc-500 hover:underline">{t.back}</Link>
      <h1 className="mt-1 text-2xl font-semibold">{t.title}{seller?.shopName ? ` · ${seller.shopName}` : ''}</h1>
    </div>
  );

  if (!seller || seller.status === 'REJECTED' || seller.status === 'PENDING') {
    const canApply = s.enabled && s.allowApply;
    return (
      <div className="max-w-2xl space-y-6">
        {header}
        {seller?.status === 'PENDING' && (
          <div className="card border-amber-200 bg-amber-50 text-sm text-amber-900">
            <p className="font-semibold">{t.pendingTitle}</p>
            <p>{t.pendingText}</p>
          </div>
        )}
        {seller?.status === 'REJECTED' && (
          <div className="card border-red-200 bg-red-50 text-sm text-red-800">
            <p className="font-semibold">{t.rejectedTitle}</p>
            {seller.adminNote && <p>{fmt(t.rejectedReason, { reason: seller.adminNote })}</p>}
            <p>{t.reapply}</p>
          </div>
        )}
        {canApply ? (
          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{t.applyTitle}</h2>
              <p className="text-sm text-zinc-500">{fmt(t.applyText, { percent: keep(s.commissionPercent) })}</p>
            </div>
            <ApplyForm initial={seller ? { shopName: seller.shopName, contact: seller.contact, intro: seller.intro } : undefined} />
          </section>
        ) : (
          !seller && <p className="card text-sm text-zinc-500">{t.closed}</p>
        )}
      </div>
    );
  }

  if (seller.status === 'SUSPENDED' || !s.enabled) {
    return (
      <div className="max-w-2xl space-y-6">
        {header}
        <div className="card border-red-200 bg-red-50 text-sm text-red-800">
          <p className="font-semibold">{t.suspendedTitle}</p>
          <p>{seller.adminNote || t.suspendedText}</p>
        </div>
      </div>
    );
  }

  await releaseSellerEarnings(seller.id);
  const [fresh, hold, earned, products, earnings, withdrawals] = await Promise.all([
    prisma.seller.findUniqueOrThrow({ where: { id: seller.id }, select: { balance: true, commissionPercent: true } }),
    prisma.sellerEarning.aggregate({ where: { sellerId: seller.id, status: 'HOLD' }, _sum: { amount: true } }),
    prisma.sellerEarning.aggregate({ where: { sellerId: seller.id, status: { not: 'REVERSED' } }, _sum: { amount: true } }),
    prisma.product.findMany({ where: { sellerId: seller.id }, select: { id: true } }),
    prisma.sellerEarning.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
    prisma.sellerWithdrawal.findMany({ where: { sellerId: seller.id }, orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);
  const [sold, orders] = await Promise.all([
    prisma.order.aggregate({ where: { productId: { in: products.map((p) => p.id) }, status: 'COMPLETED' }, _sum: { quantity: true } }),
    prisma.order.findMany({ where: { id: { in: earnings.map((e) => e.orderId) } }, select: { id: true, code: true, quantity: true, product: { select: { name: true } } } }),
  ]);
  const orderMap = new Map(orders.map((o) => [o.id, o]));
  const fee = Number(sellerFee(fresh, s));
  const stats = [
    { label: t.balance, value: <Money value={fresh.balance} />, tone: 'text-emerald-600' },
    { label: t.onHold, value: <Money value={hold._sum.amount ?? 0} />, tone: 'text-amber-600' },
    { label: t.totalEarned, value: <Money value={earned._sum.amount ?? 0} />, tone: 'text-zinc-900' },
    { label: t.itemsSold, value: (sold._sum.quantity ?? 0).toLocaleString('en-US'), tone: 'text-zinc-900' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {header}
        <Link href="/dashboard/seller/products" className="btn-primary">{t.products} ({products.length})</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((x) => (
          <div key={x.label} className="card">
            <p className="text-xs text-zinc-500">{x.label}</p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${x.tone}`}>{x.value}</p>
          </div>
        ))}
      </div>
      <p className="text-sm text-zinc-500">
        {fmt(t.fee, { percent: fee })} · {s.holdHours > 0 ? fmt(t.holdNote, { hours: s.holdHours }) : t.instantNote}
      </p>

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-x-auto p-0">
          <h2 className="px-4 pt-4 font-semibold">{t.sales}</h2>
          <table className="table">
            <thead><tr><th>{t.colDate}</th><th>{t.colOrder}</th><th>{t.colProduct}</th><th>{t.colPaid}</th><th>{t.colEarning}</th><th>{t.colStatus}</th></tr></thead>
            <tbody>
              {earnings.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-zinc-500">{t.noSales}</td></tr>}
              {earnings.map((e) => {
                const o = orderMap.get(e.orderId);
                return (
                  <tr key={e.id}>
                    <td className="text-xs whitespace-nowrap text-zinc-500"><LocalTime value={e.createdAt} /></td>
                    <td className="font-mono text-xs">{o?.code ?? '—'}</td>
                    <td className="max-w-56 truncate text-sm">{o ? localized(o.product.name, locale) : '—'} {o && <span className="text-zinc-400">× {o.quantity}</span>}</td>
                    <td className="tabular-nums"><Money value={e.orderAmount} /></td>
                    <td className="font-semibold tabular-nums"><Money value={e.amount} /></td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[e.status] ?? ''}`}>{t[`earn${e.status}` as 'earnHOLD'] ?? e.status}</span>
                      {e.status === 'HOLD' && <p className="mt-0.5 text-[11px] text-zinc-400">{t.colRelease}: <LocalTime value={e.releaseAt} /></p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <div className="space-y-6">
          <section className="card space-y-3">
            <h2 className="font-semibold">{t.withdrawTitle}</h2>
            <SellerWithdrawForm allowBalance={s.allowBalance} allowBank={s.allowBank} minWithdraw={`$${s.minWithdraw}`} />
          </section>
          <section className="card space-y-2">
            <h2 className="font-semibold">{t.withdrawals}</h2>
            {withdrawals.length === 0 && <p className="text-sm text-zinc-400">—</p>}
            <ul className="divide-y divide-zinc-100 text-sm">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 py-2">
                  <span>
                    <b className="tabular-nums"><Money value={w.amount} /></b>
                    <span className="ml-2 text-xs text-zinc-500">{w.method === 'balance' ? t.toBalanceShort : t.toBankShort} · <LocalTime value={w.createdAt} /></span>
                    {w.status === 'REJECTED' && w.note && <span className="block text-xs text-red-600">{fmt(t.rejectedReason, { reason: w.note })}</span>}
                  </span>
                  <span className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[w.status] ?? ''}`}>{t[`w${w.status}` as 'wPENDING'] ?? w.status}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
