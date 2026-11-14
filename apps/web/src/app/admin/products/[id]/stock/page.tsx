import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma, type Prisma, type StockStatus } from '@accszone/database';
import { BatchActions, StockTable } from '@/components/admin/stock-actions';
import { StockImport } from '@/components/admin/stock-import';
import { Pagination } from '@/components/pagination';
import { StatCard } from '@/components/stat-card';
import { can } from '@/lib/permissions';
import { requireStaff } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Kho hàng' };

const PAGE_SIZE = 50;
const STATUSES: StockStatus[] = ['AVAILABLE', 'RESERVED', 'SOLD', 'INVALID'];
const STATUS_LABEL: Record<StockStatus, string> = {
  AVAILABLE: 'Còn hàng',
  RESERVED: 'Đang giữ',
  SOLD: 'Đã bán',
  INVALID: 'Vô hiệu',
};

export default async function ProductStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string; batch?: string; page?: string }>;
}) {
  const user = await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const batch = sp.batch?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const product = await prisma.product.findUnique({ where: { id }, select: { id: true, source: true } });
  if (!product) notFound();

  const where: Prisma.StockItemWhereInput = { productId: id, status, importBatch: batch };
  const [statusGroups, batchGroups, filteredTotal, items] = await Promise.all([
    prisma.stockItem.groupBy({ by: ['status'], where: { productId: id }, _count: true }),
    prisma.stockItem.groupBy({
      by: ['importBatch', 'status'],
      where: { productId: id, importBatch: { not: null } },
      _count: true,
      _min: { createdAt: true },
    }),
    prisma.stockItem.count({ where }),
    prisma.stockItem.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      // KHÔNG select `content` -> dữ liệu mã hóa không bao giờ rời server khi chỉ xem danh sách
      select: { id: true, status: true, importBatch: true, createdAt: true, soldAt: true, order: { select: { code: true } } },
    }),
  ]);

  const counts = Object.fromEntries(statusGroups.map((g) => [g.status, g._count])) as Partial<Record<StockStatus, number>>;
  const totalAll = statusGroups.reduce((sum, g) => sum + g._count, 0);

  // Gom groupBy(importBatch, status) thành 1 dòng / lô
  const batchMap = new Map<string, { counts: Partial<Record<StockStatus, number>>; createdAt: Date }>();
  for (const g of batchGroups) {
    const key = g.importBatch!;
    const entry = batchMap.get(key) ?? { counts: {}, createdAt: g._min.createdAt ?? new Date(0) };
    entry.counts[g.status] = g._count;
    if (g._min.createdAt && g._min.createdAt < entry.createdAt) entry.createdAt = g._min.createdAt;
    batchMap.set(key, entry);
  }
  const batches = [...batchMap].sort((a, b) => b[1].createdAt.getTime() - a[1].createdAt.getTime()).slice(0, 10);

  const href = (overrides: { status?: string; batch?: string; page?: number }) =>
    buildHref(`/admin/products/${id}/stock`, { status, batch, ...overrides });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Còn hàng" value={(counts.AVAILABLE ?? 0).toLocaleString()} />
        <StatCard label="Đã bán" value={(counts.SOLD ?? 0).toLocaleString()} />
        <StatCard label="Vô hiệu" value={(counts.INVALID ?? 0).toLocaleString()} />
        <StatCard label="Tổng đã nhập" value={totalAll.toLocaleString()} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {product.source === 'LOCAL' ? (
          <StockImport productId={id} />
        ) : (
          <div className="card text-sm text-zinc-600">Sản phẩm RESELLER lấy hàng trực tiếp từ web gốc nên không nhập kho tay.</div>
        )}

        <section className="card">
          <h2 className="mb-3 font-semibold">Các lô nhập gần đây</h2>
          {batches.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Chưa có lô nào.</p>
          ) : (
            <table className="table">
              <thead>
                <tr><th>Lô</th><th>Ngày nhập</th><th>Còn / Bán / Vô hiệu</th><th /></tr>
              </thead>
              <tbody>
                {batches.map(([code, b]) => (
                  <tr key={code}>
                    <td>
                      <Link href={href({ batch: code, page: undefined })} className="font-mono text-xs text-blue-600 hover:underline">{code}</Link>
                    </td>
                    <td className="text-zinc-500">{formatDate(b.createdAt)}</td>
                    <td className="tabular-nums">
                      <span className="text-emerald-600">{b.counts.AVAILABLE ?? 0}</span>
                      {' / '}<span>{b.counts.SOLD ?? 0}</span>
                      {' / '}<span className="text-zinc-400">{b.counts.INVALID ?? 0}</span>
                    </td>
                    <td>
                      <BatchActions productId={id} batch={code} available={b.counts.AVAILABLE ?? 0} invalid={b.counts.INVALID ?? 0} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Hàng trong kho</h2>
          <Link href={href({ status: undefined, page: undefined })} className={`rounded-md px-2.5 py-1 text-xs font-medium ${!status ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
            Tất cả ({totalAll})
          </Link>
          {STATUSES.map((s) => (
            <Link key={s} href={href({ status: s, page: undefined })} className={`rounded-md px-2.5 py-1 text-xs font-medium ${status === s ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>
              {STATUS_LABEL[s]} ({counts[s] ?? 0})
            </Link>
          ))}
          {batch && (
            <Link href={href({ batch: undefined, page: undefined })} className="ml-auto rounded-md bg-amber-50 px-2.5 py-1 text-xs text-amber-800">
              Lô <span className="font-mono">{batch}</span> ✕
            </Link>
          )}
        </div>

        <StockTable
          productId={id}
          canReveal={can(user, 'stock.reveal')}
          items={items.map((i) => ({
            id: i.id,
            status: i.status,
            importBatch: i.importBatch,
            createdAt: formatDate(i.createdAt),
            soldAt: i.soldAt ? formatDate(i.soldAt) : null,
            orderCode: i.order?.code ?? null,
          }))}
        />

        <Pagination page={page} totalPages={Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE))} hrefFor={(p) => href({ page: p > 1 ? p : undefined })} />
      </section>
    </div>
  );
}
