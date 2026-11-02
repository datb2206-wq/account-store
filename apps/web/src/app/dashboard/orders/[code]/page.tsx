import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/auto-refresh';
import { Badge } from '@/components/badge';
import { DeliveryBox } from '@/components/shop/delivery-box';
import { StatCard } from '@/components/stat-card';
import { fmt } from '@/i18n/config';
import { translateError } from '@/i18n/errors';
import { getI18n } from '@/i18n/server';
import { requireUser } from '@/lib/auth';
import { formatDate, formatUsd } from '@/lib/format';
import { getOrderForUser } from '@/lib/purchase';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.orderDetails };
}

export default async function OrderDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const { locale, d } = await getI18n();
  const t = d.orders;
  const result = await getOrderForUser((await params).code, user.id, locale);
  if (!result) notFound();
  const { order, items } = result;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/orders" className="text-sm text-zinc-500 hover:underline">{t.back}</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold">{order.code}</h1>
          <Badge value={order.status} label={d.status[order.status]} />
        </div>
        <p className="text-sm text-zinc-500">{formatDate(new Date(order.createdAt))}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label={t.product} value={<span className="text-lg">{order.productName}</span>} />
        <StatCard label={t.quantity} value={order.quantity} hint={fmt(t.perItem, { price: formatUsd(order.unitPrice) })} />
        <StatCard label={t.totalPaid} value={formatUsd(order.totalAmount)} />
      </div>

      {order.failReason && order.status !== 'PENDING' && (
        <p className={`rounded-lg px-4 py-3 text-sm ${order.status === 'COMPLETED' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}>
          {translateError(order.failReason, d)}
        </p>
      )}

      <section className="card space-y-3">
        <h2 className="font-semibold">{t.yourAccounts}</h2>
        {items.length > 0 ? (
          <DeliveryBox items={items} orderCode={order.code} />
        ) : order.status === 'PENDING' ? (
          <div className="flex items-center gap-3 text-sm text-zinc-600">
            <span className="size-4 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-600" aria-hidden />
            {t.processing}
            <AutoRefresh />
          </div>
        ) : (
          <p className="text-sm text-zinc-500">{t.noItems}</p>
        )}
        <p className="text-xs text-zinc-400">{t.keepPrivate}</p>
      </section>
    </div>
  );
}
