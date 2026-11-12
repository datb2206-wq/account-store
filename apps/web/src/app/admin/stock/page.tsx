import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type StockStatus } from '@accszone/database';
import { FilterBar, MiniStat, PageHeader, Panel } from '@/components/admin/ui';
import { BoxIcon, CartIcon, CloseIcon, ShieldIcon } from '@/components/icons';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { localized } from '@/lib/format';

export const metadata: Metadata = { title: 'Tài khoản trong kho' };

// Tổng quan kho theo từng sản phẩm. Nội dung tài khoản (đã mã hóa) KHÔNG đọc ở đây,
// muốn xem / nhập / vô hiệu từng tài khoản thì vào "Quản lý kho" của sản phẩm.
export default async function AdminStockPage({ searchParams }: { searchParams: Promise<{ q?: string; empty?: string }> }) {
  await requireStaff();
  const sp = await searchParams;
  const q = sp.q?.trim().toLowerCase() || undefined;
  const showEmpty = sp.empty === '1';

  const [groups, lastImports, products] = await Promise.all([
    prisma.stockItem.groupBy({ by: ['productId', 'status'], _count: true }),
    prisma.stockItem.groupBy({ by: ['productId'], _max: { createdAt: true } }),
    prisma.product.findMany({
      where: { source: 'LOCAL' },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, name: true, isActive: true, category: { select: { name: true } } },
    }),
  ]);

  const counts = new Map<string, Partial<Record<StockStatus, number>>>();
  const totals: Partial<Record<StockStatus, number>> = {};
  for (const g of groups) {
    const c = counts.get(g.productId) ?? {};
    c[g.status] = g._count;
    counts.set(g.productId, c);
    totals[g.status] = (totals[g.status] ?? 0) + g._count;
  }
  const lastImport = new Map(lastImports.map((g) => [g.productId, g._max.createdAt]));

  const rows = products
    .map((p) => ({ ...p, name: localized(p.name), category: localized(p.category.name), c: counts.get(p.id) ?? {} }))
    .filter((p) => (showEmpty || (p.c.AVAILABLE ?? 0) > 0 || (p.c.INVALID ?? 0) > 0) && (!q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)));

  return (
    <div className="space-y-5">
      <PageHeader title="Tài khoản trong kho">
        <Link href="/admin/products/new" className="btn-primary bg-indigo-500 hover:bg-indigo-600">+ Thêm sản phẩm</Link>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat tone="emerald" icon={<ShieldIcon size={20} />} value={(totals.AVAILABLE ?? 0).toLocaleString('en-US')} label="Tài khoản đang bán" />
        <MiniStat tone="red" icon={<CloseIcon size={20} />} value={(totals.INVALID ?? 0).toLocaleString('en-US')} label="Tài khoản lỗi / vô hiệu" />
        <MiniStat tone="sky" icon={<CartIcon size={20} />} value={(totals.SOLD ?? 0).toLocaleString('en-US')} label="Tài khoản đã bán" />
        <MiniStat tone="violet" icon={<BoxIcon size={20} />} value={products.filter((p) => (counts.get(p.id)?.AVAILABLE ?? 0) > 0).length} label="Sản phẩm còn hàng" />
      </div>

      <Panel title="Kho hàng theo sản phẩm">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/stock" active={!!q || showEmpty}>
            <input name="q" defaultValue={sp.q} placeholder="Tên sản phẩm / chuyên mục" className="input w-64" />
            <label className="flex items-center gap-1.5 text-sm text-zinc-600">
              <input type="checkbox" name="empty" value="1" defaultChecked={showEmpty} /> Hiện cả sản phẩm hết hàng
            </label>
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Sản phẩm</th><th>Chuyên mục</th><th className="text-right">Đang bán</th><th className="text-right">Lỗi</th><th className="text-right">Đã bán</th><th>Nhập gần nhất</th><th /></tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-400">Không có sản phẩm nào {showEmpty ? '' : 'còn hàng'}</td></tr>}
                {rows.map((p) => (
                  <tr key={p.id} className="odd:bg-zinc-50/60">
                    <td className="max-w-md">
                      <p className="font-medium text-zinc-800">{p.name}</p>
                      {!p.isActive && <span className="text-[11px] text-zinc-400">Đang ẩn</span>}
                    </td>
                    <td><span className="rounded bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{p.category}</span></td>
                    <td className="text-right font-semibold text-emerald-600 tabular-nums">{(p.c.AVAILABLE ?? 0).toLocaleString('en-US')}</td>
                    <td className="text-right text-red-500 tabular-nums">{(p.c.INVALID ?? 0).toLocaleString('en-US')}</td>
                    <td className="text-right text-zinc-600 tabular-nums">{(p.c.SOLD ?? 0).toLocaleString('en-US')}</td>
                    <td className="text-xs whitespace-nowrap text-zinc-500">{lastImport.get(p.id) ? <LocalTime value={lastImport.get(p.id)} /> : '—'}</td>
                    <td className="text-right whitespace-nowrap">
                      <Link href={`/admin/products/${p.id}/stock`} className="rounded-md bg-indigo-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-600">Quản lý kho</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-zinc-400">Sản phẩm lấy qua API nhà cung cấp không có kho riêng nên không hiện ở đây.</p>
        </div>
      </Panel>
    </div>
  );
}
