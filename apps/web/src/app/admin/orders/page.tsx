import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type OrderStatus, type Prisma } from '@accszone/database';
import { Badge } from '@/components/badge';
import { Pagination } from '@/components/pagination';
import { StatCard } from '@/components/stat-card';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatUsd, localized } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Đơn hàng' };

const PAGE_SIZE = 30;
// Đơn RESELLER PENDING lâu hơn ngưỡng này coi là "kẹt"
const STUCK_MINUTES = 5;
const STATUSES: OrderStatus[] = ['PENDING', 'COMPLETED', 'REFUNDED', 'FAILED'];

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; source?: string; stuck?: string; page?: string }>;
}) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim() ?? '';
  const status = STATUSES.find((s) => s === sp.status);
  const source = sp.source === 'LOCAL' || sp.source === 'RESELLER' ? sp.source : undefined;
  const stuck = sp.stuck === '1';
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);
  const stuckBefore = new Date(Date.now() - STUCK_MINUTES * 60_000);
  const stuckWhere: Prisma.OrderWhereInput = { status: 'PENDING', supplierId: { not: null }, createdAt: { lt: stuckBefore } };

  const where: Prisma.OrderWhereInput = {
    ...(stuck ? stuckWhere : { status }),
    ...(source && { product: { source } }),
    ...(q && {
      OR: [
        { code: q.toUpperCase() },
        { id: q },
        { externalOrderId: q },
        { user: { email: { contains: q, mode: 'insensitive' } } },
      ],
    }),
  };

  const [total, revenue, pendingCount, stuckCount, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.aggregate({ where: { ...where, status: 'COMPLETED' }, _sum: { totalAmount: true } }),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: stuckWhere }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        user: { select: { email: true } },
        product: { select: { name: true, source: true, costPrice: true } },
        supplier: { select: { name: true } },
      },
    }),
  ]);

  // Lãi từng đơn hoàn tất = tiền thực thu (trừ phần đã hoàn) − giá vốn lúc mua × số lượng
  const refundRows = await prisma.transaction.groupBy({
    by: ['orderId'],
    where: { orderId: { in: orders.filter((o) => o.status === 'COMPLETED').map((o) => o.id) }, type: 'REFUND', status: 'COMPLETED' },
    _sum: { amount: true },
  });
  const refunded = new Map(refundRows.map((r) => [r.orderId, r._sum.amount]));
  const profitOf = (o: (typeof orders)[number]) => {
    if (o.status !== 'COMPLETED') return null;
    const cost = o.unitCost ?? o.product.costPrice;
    if (!cost) return null;
    return o.totalAmount.sub(refunded.get(o.id) ?? 0).sub(cost.mul(o.quantity));
  };

  const filters = { q, status, source, stuck: stuck ? '1' : undefined };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Đơn hàng <span className="text-base font-normal text-zinc-400">({total})</span></h1>
        <Link href={buildHref('/admin/orders', { stuck: '1' })} className={stuck ? 'btn-primary' : 'btn-ghost border border-zinc-200'}>
          Đơn RESELLER kẹt {stuckCount > 0 && <span className="rounded-full bg-red-500 px-1.5 text-xs text-white">{stuckCount}</span>}
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Số đơn (theo bộ lọc)" value={total.toLocaleString()} />
        <StatCard label="Doanh thu đơn hoàn tất (theo bộ lọc)" value={formatUsd(revenue._sum.totalAmount)} />
        <StatCard label="Đang chờ xử lý" value={pendingCount} hint={stuckCount ? `${stuckCount} đơn quá ${STUCK_MINUTES} phút` : undefined} />
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Mã đơn, email, mã đơn web gốc…" className="input w-72" />
        <select name="status" defaultValue={status ?? ''} className="input w-40">
          <option value="">Mọi trạng thái</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select name="source" defaultValue={source ?? ''} className="input w-44">
          <option value="">Mọi nguồn hàng</option>
          <option value="LOCAL">Kho (LOCAL)</option>
          <option value="RESELLER">Nhà cung cấp</option>
        </select>
        <button className="btn-primary">Lọc</button>
        {(q || status || source || stuck) && <Link href="/admin/orders" className="btn-ghost">Xóa lọc</Link>}
      </form>

      {stuck && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Đơn hàng nhà cung cấp còn PENDING quá {STUCK_MINUTES} phút. Worker tự kiểm tra lại mỗi phút và tự hoàn tiền sau 24 giờ — mở đơn để kiểm tra lại ngay, giao tay hoặc hoàn tiền.
        </p>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Thời gian</th><th>Mã đơn</th><th>Khách</th><th>Sản phẩm</th><th>Tổng</th><th>Lãi</th><th>Nguồn</th><th>Trạng thái</th><th /></tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr><td colSpan={9} className="py-10 text-center text-zinc-500">Không có đơn hàng nào.</td></tr>
            )}
            {orders.map((o) => {
              const isStuck = o.status === 'PENDING' && o.supplierId && o.createdAt < stuckBefore;
              return (
                <tr key={o.id} className={isStuck ? 'bg-red-50/50' : undefined}>
                  <td className="whitespace-nowrap text-zinc-500">{formatDate(o.createdAt)}</td>
                  <td className="font-mono text-xs">{o.code}</td>
                  <td className="max-w-48 truncate">{o.user.email}</td>
                  <td>{localized(o.product.name)} <span className="text-zinc-400">× {o.quantity}</span></td>
                  <td className="tabular-nums">{formatUsd(o.totalAmount)}</td>
                  <td className="tabular-nums">
                    {(() => {
                      const profit = profitOf(o);
                      if (!profit) return <span className="text-zinc-300">—</span>;
                      return <span className={profit.isNegative() ? 'text-red-600' : 'text-emerald-600'}>{formatUsd(profit)}</span>;
                    })()}
                  </td>
                  <td>
                    {o.product.source === 'RESELLER' ? (
                      <span className="text-xs">
                        <Badge value="RESELLER" tone="blue" />
                        {o.externalOrderId && <span className="ml-1 font-mono text-zinc-400">{o.externalOrderId}</span>}
                      </span>
                    ) : (
                      <Badge value="LOCAL" tone="gray" />
                    )}
                  </td>
                  <td>
                    <Badge value={o.status} />
                    {isStuck && <span className="ml-1 text-xs font-medium text-red-600">kẹt</span>}
                    {o.failReason && o.status === 'COMPLETED' && <span className="ml-1 text-xs text-amber-600" title={o.failReason}>⚠</span>}
                  </td>
                  <td className="text-right">
                    <Link href={`/admin/orders/${o.code}`} className="text-sm font-medium text-blue-600 hover:underline">
                      {o.status === 'PENDING' ? 'Xử lý' : 'Xem'}
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(p) => buildHref('/admin/orders', { ...filters, page: p > 1 ? p : undefined })} />
    </div>
  );
}
