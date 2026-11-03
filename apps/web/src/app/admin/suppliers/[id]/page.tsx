import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@accszone/database';
import { decrypt, getAdapter } from '@accszone/core';
import { PublishButton, SupplierForm, SyncButton } from '@/components/admin/supplier-form';
import { Badge } from '@/components/badge';
import { StatCard } from '@/components/stat-card';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatUsd } from '@/lib/format';
import { workerOnline } from '@/lib/queue';

export const metadata: Metadata = { title: 'Nhà cung cấp' };

interface SyncLog {
  error?: string;
  fetched?: number;
  productsCreated?: number;
  productsUpdated?: number;
  productsMissing?: number;
  categoriesCreated?: number;
  categoriesMatched?: number;
  durationMs?: number;
  trigger?: string;
}

export default async function AdminSupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const [supplier, productStats, publishable, logs, online] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id },
      select: { id: true, name: true, adapter: true, baseUrl: true, apiKeyEnc: true, priceMarkup: true, isActive: true, lastSyncAt: true },
    }),
    prisma.product.groupBy({ by: ['isActive'], where: { supplierId: id }, _count: true, _sum: { externalStock: true } }),
    prisma.product.count({ where: { supplierId: id, isActive: false, externalStock: { gt: 0 } } }),
    prisma.auditLog.findMany({
      where: { entity: 'Supplier', entityId: id, action: { in: ['supplier.sync', 'supplier.sync.failed'] } },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { actor: { select: { email: true } } },
    }),
    workerOnline(),
  ]);
  if (!supplier) notFound();

  const balance = await sourceBalance(supplier);
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Sản phẩm đang bán" value={active?._count ?? 0} />
        <StatCard label="Sản phẩm đang ẩn" value={hidden?._count ?? 0} hint="Sản phẩm mới đồng bộ mặc định ẩn" />
        <StatCard label="Tổng tồn kho web gốc" value={((active?._sum.externalStock ?? 0) + (hidden?._sum.externalStock ?? 0)).toLocaleString()} />
        <StatCard label="Đồng bộ gần nhất" value={<span className="text-base">{formatDate(supplier.lastSyncAt)}</span>} />
        <StatCard
          label="Số dư tại nguồn"
          value={balance.ok ? formatUsd(balance.value) : <span className="text-base text-zinc-400">—</span>}
          hint={balance.ok ? 'Hết tiền ở nguồn thì đơn của khách bị hoàn tiền: nạp thêm khi thấp' : balance.error}
        />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <section className="card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Lịch sử đồng bộ</h2>
              <div className="flex flex-wrap items-start gap-2">
                <PublishButton supplierId={supplier.id} count={publishable} />
                <SyncButton supplierId={supplier.id} disabled={!supplier.isActive} />
              </div>
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
                              {!!r.categoriesMatched && <> · {r.categoriesMatched} danh mục ghép vào danh mục có sẵn</>}
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
            Giá bán tự tính = giá vốn × markup ở mỗi lần đồng bộ. Danh mục nguồn trùng tên với danh mục có sẵn của shop được ghép vào danh mục đó.
            Khách mua hàng của nguồn nhận tài khoản ngay trong lúc mua; nguồn chậm hoặc lỗi thì worker tự thử lại, quá 24 giờ thì hoàn tiền.
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

// Số dư tài khoản mình tại web gốc (nguồn không hỗ trợ / lỗi mạng -> hiện lý do thay vì làm hỏng trang)
async function sourceBalance(supplier: { adapter: string; baseUrl: string; apiKeyEnc: string }) {
  const adapter = getAdapter(supplier.adapter);
  if (!adapter.getBalance) return { ok: false as const, error: 'Nguồn này không cung cấp số dư qua API' };
  try {
    return { ok: true as const, value: await adapter.getBalance({ baseUrl: supplier.baseUrl, apiKey: decrypt(supplier.apiKeyEnc) }) };
  } catch (err) {
    return { ok: false as const, error: `Không lấy được số dư: ${err instanceof Error ? err.message : String(err)}`.slice(0, 160) };
  }
}
