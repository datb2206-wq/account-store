import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { SupplierForm, SyncButton } from '@/components/admin/supplier-form';
import { Badge } from '@/components/badge';
import { StatCard } from '@/components/stat-card';
import { requireStaff } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { workerOnline } from '@/lib/queue';

export const metadata: Metadata = { title: 'Nhà cung cấp' };

interface SyncLog {
  error?: string;
  fetched?: number;
  productsCreated?: number;
  productsUpdated?: number;
  productsMissing?: number;
  categoriesCreated?: number;
  durationMs?: number;
  trigger?: string;
}

export default async function AdminSupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const [supplier, productStats, logs, online] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id },
      select: { id: true, name: true, adapter: true, baseUrl: true, priceMarkup: true, isActive: true, lastSyncAt: true },
    }),
    prisma.product.groupBy({ by: ['isActive'], where: { supplierId: id }, _count: true, _sum: { externalStock: true } }),
    prisma.auditLog.findMany({
      where: { entity: 'Supplier', entityId: id, action: { in: ['supplier.sync', 'supplier.sync.failed'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { actor: { select: { email: true } } },
    }),
    workerOnline(),
  ]);
  if (!supplier) notFound();

  const active = productStats.find((g) => g.isActive);
  const hidden = productStats.find((g) => !g.isActive);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/suppliers" className="text-sm text-zinc-500 hover:underline">← Nhà cung cấp</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{supplier.name}</h1>
          <Badge value={supplier.isActive ? 'Bật' : 'Tắt'} tone={supplier.isActive ? 'green' : 'gray'} />
          {!online && <Badge value="Worker KHÔNG chạy" tone="red" />}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sản phẩm đang bán" value={active?._count ?? 0} />
        <StatCard label="Sản phẩm đang ẩn" value={hidden?._count ?? 0} hint="Sản phẩm mới đồng bộ mặc định ẩn" />
        <StatCard label="Tổng tồn kho web gốc" value={((active?._sum.externalStock ?? 0) + (hidden?._sum.externalStock ?? 0)).toLocaleString()} />
        <StatCard label="Đồng bộ gần nhất" value={<span className="text-base">{formatDate(supplier.lastSyncAt)}</span>} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Lịch sử đồng bộ</h2>
              <SyncButton supplierId={supplier.id} disabled={!supplier.isActive} />
            </div>
            {logs.length === 0 ? (
              <p className="text-sm text-zinc-500">Chưa đồng bộ lần nào.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Thời gian</th><th>Kết quả</th><th>Nguồn</th></tr>
                </thead>
                <tbody>
                  {logs.map((log) => {
                    const r = (log.after ?? {}) as SyncLog;
                    return (
                      <tr key={log.id}>
                        <td className="whitespace-nowrap text-zinc-500">{formatDate(log.createdAt)}</td>
                        <td>
                          {log.action === 'supplier.sync.failed' ? (
                            <span className="text-red-600">✕ {r.error}</span>
                          ) : (
                            <span>
                              ✓ {r.fetched} sản phẩm · <b>+{r.productsCreated}</b> mới · {r.productsUpdated} cập nhật
                              {!!r.productsMissing && <> · {r.productsMissing} hết hàng/ngừng bán</>}
                              {!!r.categoriesCreated && <> · +{r.categoriesCreated} danh mục</>}
                              <span className="text-zinc-400"> · {r.durationMs}ms</span>
                            </span>
                          )}
                        </td>
                        <td className="text-xs text-zinc-500">{r.trigger === 'manual' ? `Thủ công${log.actor ? ` · ${log.actor.email}` : ''}` : 'Định kỳ'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
          <p className="text-sm text-zinc-500">
            Xem và bật bán sản phẩm ở{' '}
            <Link href="/admin/products?status=inactive" className="font-medium text-blue-600 hover:underline">Sản phẩm → Đã ẩn</Link>.
            Giá bán tự tính = giá vốn × markup ở mỗi lần đồng bộ.
          </p>
        </div>

        {user.role === 'SUPER_ADMIN' && (
          <SupplierForm
            supplierId={supplier.id}
            initial={{ name: supplier.name, adapter: supplier.adapter, baseUrl: supplier.baseUrl, priceMarkup: supplier.priceMarkup.toString(), isActive: supplier.isActive }}
          />
        )}
      </div>
    </div>
  );
}
