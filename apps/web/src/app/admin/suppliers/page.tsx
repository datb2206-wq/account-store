import type { Metadata } from 'next';
import Link from 'next/link';
import { supplierClient } from '@accszone/core';
import { Prisma, prisma } from '@accszone/database';
import { SupplierActionsMenu, SupplierActiveToggle } from '@/components/admin/supplier-list-controls';
import { MiniStat, PageHeader, Panel } from '@/components/admin/ui';
import { Badge } from '@/components/badge';
import { ORDER_COST, ORDER_REFUNDS_JOIN, NET_REVENUE } from '@/lib/admin-stats';
import { requireStaff } from '@/lib/auth';
import { formatDate, formatUsd } from '@/lib/format';
import { can } from '@/lib/permissions';
import { workerOnline } from '@/lib/queue';

export const metadata: Metadata = { title: 'Kết nối API' };

const ADAPTER_LABEL: Record<string, string> = { accszone: 'AccsZone API v1', via79: 'SHOPCLONE7', buyaccfb: 'BuyAccFB', generic: 'API khác' };
const ADAPTER_TONE: Record<string, string> = {
  accszone: 'bg-sky-100 text-sky-700',
  via79: 'bg-violet-100 text-violet-700',
  buyaccfb: 'bg-blue-100 text-blue-700',
  generic: 'bg-zinc-100 text-zinc-700',
};
const BALANCE_TIMEOUT_MS = 8_000;

// Số dư tại nguồn: mỗi nguồn tối đa 8 giây, lỗi thì hiện "—" thay vì làm chậm/hỏng cả trang
async function balanceOf(s: Parameters<typeof supplierClient>[0]): Promise<{ value: number } | { error: string }> {
  try {
    const client = supplierClient(s);
    if (!client.getBalance) return { error: 'Nguồn không có API số dư' };
    const value = await Promise.race([
      client.getBalance(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Quá thời gian chờ')), BALANCE_TIMEOUT_MS)),
    ]);
    return { value: Number(value) };
  } catch (err) {
    return { error: (err instanceof Error ? err.message : String(err)).slice(0, 120) };
  }
}

function OnOffBadge({ on }: { on: boolean }) {
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${on ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{on ? 'ON' : 'OFF'}</span>;
}

function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${tone}`}>{children}</span>;
}

export default async function AdminSuppliersPage() {
  const user = await requireStaff();
  const [suppliers, online, catCounts, orderRows] = await Promise.all([
    prisma.supplier.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        adapter: true,
        baseUrl: true,
        apiKeyEnc: true,
        priceRate: true,
        proxyEnc: true,
        priceMarkup: true,
        autoUpdatePrice: true,
        priceRounding: true,
        autoUpdateInfo: true,
        syncCategories: true,
        autoActivate: true,
        isActive: true,
        lastSyncAt: true,
        _count: { select: { products: true } },
      },
    }),
    workerOnline().catch(() => false),
    prisma.category.groupBy({ by: ['supplierId'], where: { supplierId: { not: null } }, _count: true }),
    // Đơn hoàn tất theo từng nguồn: doanh thu thực thu (trừ phần đã hoàn) và giá vốn lúc mua
    prisma.$queryRaw<{ supplierId: string; orders: number; revenue: string; cost: string }[]>(Prisma.sql`
      SELECT o."supplierId" AS "supplierId", count(*)::int AS orders,
             coalesce(sum(${NET_REVENUE}), 0)::text AS revenue,
             coalesce(sum(${ORDER_COST}), 0)::text AS cost
      FROM orders o JOIN products p ON p.id = o."productId" ${ORDER_REFUNDS_JOIN}
      WHERE o.status = 'COMPLETED' AND o."supplierId" IS NOT NULL
      GROUP BY o."supplierId"`),
  ]);

  const balances = await Promise.all(suppliers.map((s) => (s.isActive ? balanceOf(s) : Promise.resolve({ error: 'Đang tắt' }))));
  const cats = new Map(catCounts.map((c) => [c.supplierId!, c._count]));
  const stats = new Map(orderRows.map((r) => [r.supplierId, { orders: r.orders, revenue: Number(r.revenue), cost: Number(r.cost) }]));
  const total = orderRows.reduce((t, r) => ({ orders: t.orders + r.orders, revenue: t.revenue + Number(r.revenue), cost: t.cost + Number(r.cost) }), { orders: 0, revenue: 0, cost: 0 });
  const canEdit = can(user, 'suppliers.edit');
  const canSync = can(user, 'suppliers.sync');

  return (
    <div className="space-y-5">
      <PageHeader title="Kết nối API" count={suppliers.length}>
        <Badge value={online ? 'Worker đang chạy' : 'Worker KHÔNG chạy'} tone={online ? 'green' : 'red'} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat icon="🛒" value={total.orders.toLocaleString('en-US')} label="Đơn hàng" tone="violet" />
        <MiniStat icon="💵" value={formatUsd(total.revenue)} label="Doanh thu đơn hàng" tone="sky" />
        <MiniStat icon="📦" value={formatUsd(total.cost)} label="Giá vốn" tone="amber" />
        <MiniStat icon="📈" value={formatUsd(total.revenue - total.cost)} label="Lợi nhuận" tone="emerald" />
      </div>

      {!online && (
        <p className="rounded-xl border-l-4 border-red-500 bg-white px-4 py-3 text-sm text-zinc-600 shadow-sm">
          ⚠️ Worker đang không chạy: sản phẩm không tự đồng bộ và đơn của nguồn API không được giao. Hãy bật worker (máy chủ chạy nền) để hệ thống tự cập nhật dữ liệu từ API.
        </p>
      )}

      <Panel
        title="Danh sách API đang kết nối"
        bodyClassName="overflow-x-auto"
        action={canEdit && <Link href="/admin/suppliers/new" className="rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white uppercase hover:bg-indigo-700">+ Thêm website API</Link>}
      >
        <table className="table min-w-[1000px]">
          <thead>
            <tr><th>Website</th><th className="text-center">Loại</th><th className="text-right">Số dư</th><th>Thống kê</th><th>Chi tiết</th><th className="text-center">Trạng thái</th><th className="text-right">Thao tác</th></tr>
          </thead>
          <tbody>
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-zinc-500">
                  Chưa có kết nối API nào.{' '}
                  {canEdit && <Link href="/admin/suppliers/new" className="font-medium text-blue-600 hover:underline">Thêm kết nối đầu tiên</Link>}
                </td>
              </tr>
            )}
            {suppliers.map((s, i) => {
              const st = stats.get(s.id) ?? { orders: 0, revenue: 0, cost: 0 };
              const bal = balances[i]!;
              return (
                <tr key={s.id} className="align-middle">
                  <td className="space-y-1">
                    <Link href={`/admin/suppliers/${s.id}`} className="font-medium text-zinc-800 hover:text-blue-600">{s.name}</Link>
                    <p className="text-xs text-zinc-500">
                      🔗 Domain:{' '}
                      <a href={s.baseUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-indigo-600 hover:underline">{s.baseUrl.replace(/\/api(\/v\d+)?\/?$/, '/')}</a>
                    </p>
                    <p className="text-xs text-zinc-500">🔑 API key: <span className="text-zinc-400">đã lưu (mã hóa)</span>{s.proxyEnc && ' · 🌐 proxy'}</p>
                    <p className="text-[11px] text-zinc-400">Đồng bộ gần nhất: {formatDate(s.lastSyncAt)}</p>
                  </td>
                  <td className="text-center">
                    <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase ${ADAPTER_TONE[s.adapter] ?? ADAPTER_TONE.generic}`}>{ADAPTER_LABEL[s.adapter] ?? s.adapter}</span>
                  </td>
                  <td className="text-right tabular-nums">
                    {'value' in bal ? (
                      <span className={`font-medium ${bal.value <= 0 ? 'text-red-600' : 'text-zinc-800'}`}>{formatUsd(bal.value)}</span>
                    ) : (
                      <span className="text-zinc-400" title={bal.error}>—</span>
                    )}
                  </td>
                  <td>
                    <div className="flex max-w-40 flex-col items-start gap-1">
                      <Pill tone="border-amber-300 text-amber-600">Chuyên mục: {(cats.get(s.id) ?? 0).toLocaleString('en-US')}</Pill>
                      <Pill tone="border-indigo-300 text-indigo-600">Sản phẩm: {s._count.products.toLocaleString('en-US')}</Pill>
                      <Pill tone="border-sky-300 text-sky-600">Đơn hàng: {st.orders.toLocaleString('en-US')}</Pill>
                      <Pill tone="border-red-300 text-red-600">Doanh thu: {formatUsd(st.revenue)}</Pill>
                      <Pill tone="border-emerald-300 text-emerald-600">Lợi nhuận: {formatUsd(st.revenue - st.cost)}</Pill>
                    </div>
                  </td>
                  <td className="space-y-1 text-[13px] text-zinc-700">
                    <p>Tăng giá: <Pill tone="border-indigo-300 text-indigo-600">{Math.round((Number(s.priceMarkup) - 1) * 10000) / 100}%</Pill></p>
                    <p>Cập nhật tên sản phẩm: <OnOffBadge on={s.autoUpdateInfo} /></p>
                    <p>Cập nhật giá bán: <OnOffBadge on={s.autoUpdatePrice} /></p>
                    <p>Làm tròn giá bán: {s.priceRounding === 'none' ? <OnOffBadge on={false} /> : <Pill tone="border-zinc-300 text-zinc-600">${s.priceRounding}</Pill>}</p>
                    <p>Đồng bộ chuyên mục API: <OnOffBadge on={s.syncCategories} /></p>
                    <p>Tự bật bán sản phẩm mới: <OnOffBadge on={s.autoActivate} /></p>
                    {s.priceRate && <p>Tỷ giá riêng: <span className="font-mono text-xs">{s.priceRate.toFixed()}</span></p>}
                  </td>
                  <td className="text-center">
                    <SupplierActiveToggle supplierId={s.id} active={s.isActive} disabled={!canEdit} />
                  </td>
                  <td className="text-right">
                    <SupplierActionsMenu supplierId={s.id} active={s.isActive} canSync={canSync} canEdit={canEdit} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
