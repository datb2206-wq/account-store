import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Prisma, prisma } from '@accszone/database';
import { OrderItems, PendingOrderActions, RefundPanel } from '@/components/admin/order-actions';
import { Badge } from '@/components/badge';
import { can } from '@/lib/permissions';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatUsd, localized } from '@/lib/format';

export const metadata: Metadata = { title: 'Chi tiết đơn hàng' };

export default async function AdminOrderDetailPage({ params }: { params: Promise<{ code: string }> }) {
  const admin = await requireStaff();
  const { code } = await params;

  const order = await prisma.order.findUnique({
    where: { code },
    include: {
      user: { select: { email: true, balance: true } },
      product: { select: { id: true, name: true, source: true, costPrice: true } },
      supplier: { select: { id: true, name: true } },
      stockItems: { select: { id: true, status: true, soldAt: true }, orderBy: { soldAt: 'asc' } },
      transactions: { orderBy: { createdAt: 'asc' }, include: { reviewedBy: { select: { email: true } } } },
    },
  });
  if (!order) notFound();

  const logs = await prisma.auditLog.findMany({
    where: {
      OR: [
        { entity: 'Order', entityId: order.id },
        // Lần xem nội dung tài khoản của đơn này
        { entity: 'StockItem', action: 'stock.reveal', entityId: { in: order.stockItems.map((i) => i.id) } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    include: { actor: { select: { email: true } } },
  });

  const refunded = order.transactions
    .filter((t) => t.type === 'REFUND' && t.status === 'COMPLETED')
    .reduce((sum, t) => sum.add(t.amount), new Prisma.Decimal(0));
  const remaining = order.totalAmount.sub(refunded);
  const isReseller = order.product.source === 'RESELLER';
  const isSuper = can(admin, 'orders.refund');
  const canRefund = isSuper && (order.status === 'PENDING' || order.status === 'COMPLETED') && remaining.gt(0);

  const fields: [string, React.ReactNode][] = [
    ['Khách hàng', <Link key="u" href={`/admin/orders?q=${encodeURIComponent(order.user.email)}`} className="text-blue-600 hover:underline">{order.user.email}</Link>],
    ['Số dư hiện tại của khách', formatUsd(order.user.balance)],
    ['Sản phẩm', <Link key="p" href={`/admin/products/${order.product.id}`} className="text-blue-600 hover:underline">{localized(order.product.name)}</Link>],
    ['Số lượng × Đơn giá', `${order.quantity} × ${formatUsd(order.unitPrice)}`],
    ['Tổng tiền', <b key="t">{formatUsd(order.totalAmount)}</b>],
    ['Đã hoàn', refunded.gt(0) ? <span key="r" className="text-red-600">{formatUsd(refunded)}</span> : '—'],
    ['Nguồn hàng', isReseller ? `RESELLER · ${order.supplier?.name ?? '(nhà cung cấp đã xóa)'}` : 'Kho (LOCAL)'],
    ['Mã đơn web gốc', order.externalOrderId ? <span key="e" className="font-mono">{order.externalOrderId}</span> : '—'],
    ['Thông báo cho khách', order.failReason ?? '—'],
    ['Idempotency-Key', <span key="k" className="font-mono text-xs break-all text-zinc-400">{order.idempotencyKey ?? '—'}</span>],
    ['Tạo lúc', formatDate(order.createdAt)],
    ['Cập nhật', formatDate(order.updatedAt)],
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/orders" className="text-sm text-zinc-500 hover:underline">← Đơn hàng</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="font-mono text-2xl font-semibold">{order.code}</h1>
          <Badge value={order.status} />
          <Badge value={isReseller ? 'RESELLER' : 'LOCAL'} tone={isReseller ? 'blue' : 'gray'} />
        </div>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card divide-y divide-zinc-100 p-0">
            {fields.map(([label, value]) => (
              <div key={label} className="grid grid-cols-[180px_1fr] gap-3 px-4 py-2.5 text-sm">
                <span className="text-zinc-500">{label}</span>
                <span className="min-w-0">{value}</span>
              </div>
            ))}
          </section>

          <OrderItems
            orderId={order.id}
            canReveal={can(admin, 'stock.reveal')}
            canReplace={!isReseller && order.status === 'COMPLETED'}
            items={order.stockItems.map((i) => ({ id: i.id, status: i.status, soldAt: formatDate(i.soldAt) }))}
          />

          <section className="card">
            <h2 className="mb-3 font-semibold">Sổ cái của đơn</h2>
            <table className="table">
              <thead>
                <tr><th>Thời gian</th><th>Loại</th><th>Số tiền</th><th>Số dư sau</th><th>Ghi chú</th><th /></tr>
              </thead>
              <tbody>
                {order.transactions.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap text-zinc-500">{formatDate(t.createdAt)}</td>
                    <td className="text-xs font-medium">{t.type}</td>
                    <td className={`tabular-nums ${t.amount.isNegative() ? 'text-red-600' : 'text-emerald-600'}`}>{formatUsd(t.amount)}</td>
                    <td className="tabular-nums text-zinc-500">{t.balanceAfter ? formatUsd(t.balanceAfter) : '—'}</td>
                    <td className="text-xs text-zinc-500">{t.note ?? '—'}</td>
                    <td className="text-right"><Link href={`/admin/transactions/${t.id}`} className="text-xs text-blue-600 hover:underline">Xem</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h2 className="mb-3 font-semibold">Lịch sử xử lý (audit log)</h2>
            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">Chưa có thao tác nào.</p>
            ) : (
              <ul className="space-y-3 text-sm">
                {logs.map((log) => (
                  <li key={log.id} className="border-l-2 border-zinc-200 pl-3">
                    <div className="flex flex-wrap gap-x-2">
                      <span className="text-zinc-400">{formatDate(log.createdAt)}</span>
                      <span className="font-mono text-xs font-medium">{log.action}</span>
                      <span className="text-zinc-600">bởi {log.actor?.email ?? 'hệ thống'}</span>
                    </div>
                    {log.after !== null && <pre className="mt-1 overflow-x-auto text-xs whitespace-pre-wrap text-zinc-500">{JSON.stringify(log.after)}</pre>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {order.status === 'PENDING' && isReseller && (
            <PendingOrderActions orderId={order.id} quantity={order.quantity} hasExternalOrder={!!order.externalOrderId} />
          )}
          {canRefund && <RefundPanel orderId={order.id} remaining={remaining.toString()} pendingOnlyFull={order.status === 'PENDING'} />}
          {!canRefund && order.status !== 'PENDING' && (
            <div className="card text-sm text-zinc-500">
              {order.status === 'REFUNDED' ? 'Đơn đã được hoàn tiền toàn bộ.' : isSuper ? 'Không còn thao tác nào.' : 'Bạn không có quyền hoàn tiền.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
