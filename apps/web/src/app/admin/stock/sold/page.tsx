import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type Prisma } from '@accszone/database';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { Pagination } from '@/components/pagination';
import { vnDayRange } from '@/lib/admin-stats';
import { requireStaff } from '@/lib/auth';
import { localized } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Tài khoản đã bán' };

const PAGE_SIZE = 30;

// Danh sách tài khoản đã giao cho khách. Không giải mã nội dung ở danh sách:
// mở đơn hàng để xem tài khoản đã giao (có ghi nhật ký).
export default async function SoldStockPage({ searchParams }: { searchParams: Promise<Partial<Record<string, string>>> }) {
  await requireStaff();
  const sp = await searchParams;
  const order = sp.order?.trim() || undefined;
  const q = sp.q?.trim() || undefined;
  const product = sp.product?.trim() || undefined;
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1);

  const where: Prisma.StockItemWhereInput = {
    status: 'SOLD',
    soldAt: vnDayRange(sp.from, sp.to),
    order: order || q
      ? {
          code: order ? { contains: order, mode: 'insensitive' } : undefined,
          user: q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { username: { contains: q, mode: 'insensitive' } }] } : undefined,
        }
      : undefined,
    productId: product,
  };

  const [total, rows, products] = await Promise.all([
    prisma.stockItem.count({ where }),
    prisma.stockItem.findMany({
      where,
      orderBy: { soldAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, importBatch: true, soldAt: true,
        product: { select: { id: true, name: true } },
        order: { select: { code: true, user: { select: { email: true } } } },
      },
    }),
    prisma.product.findMany({ where: { source: 'LOCAL' }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);
  const filters = { order, q, product, from: sp.from, to: sp.to };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader title="Tài khoản đã bán" count={total} />
      <Panel title="Danh sách tài khoản đã bán">
        <div className="space-y-4">
          <FilterBar resetHref="/admin/stock/sold" active={filtered}>
            <input name="order" defaultValue={order} placeholder="Mã đơn hàng" className="input w-44" />
            <input name="q" defaultValue={q} placeholder="Email người mua" className="input w-52" />
            <select name="product" defaultValue={product ?? ''} className="input w-64">
              <option value="">Mọi sản phẩm</option>
              {products.map((p) => <option key={p.id} value={p.id}>{localized(p.name)}</option>)}
            </select>
            <input type="date" name="from" defaultValue={sp.from} className="input w-40" title="Từ ngày" />
            <input type="date" name="to" defaultValue={sp.to} className="input w-40" title="Đến ngày" />
          </FilterBar>

          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr><th>Mã tài khoản</th><th>Sản phẩm</th><th>Mã đơn hàng</th><th>Người mua</th><th>Lô nhập</th><th>Thời gian bán</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-400">Không có dữ liệu</td></tr>}
                {rows.map((s) => (
                  <tr key={s.id} className="odd:bg-zinc-50/60">
                    <td className="font-mono text-xs text-zinc-500">{s.id.slice(-10)}</td>
                    <td className="max-w-md truncate">
                      <Link href={`/admin/products/${s.product.id}/stock`} className="hover:text-indigo-600">{localized(s.product.name)}</Link>
                    </td>
                    <td>{s.order ? <Link href={`/admin/orders/${s.order.code}`} className="font-mono text-xs font-medium text-indigo-600 hover:underline">{s.order.code}</Link> : '—'}</td>
                    <td className="max-w-52 truncate text-sm">{s.order?.user.email ?? '—'}</td>
                    <td className="font-mono text-xs text-zinc-400">{s.importBatch?.slice(-10) ?? '—'}</td>
                    <td className="text-xs whitespace-nowrap text-zinc-500"><LocalTime value={s.soldAt} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))} hrefFor={(p) => buildHref('/admin/stock/sold', { ...filters, page: p > 1 ? p : undefined })} />
        </div>
      </Panel>
    </div>
  );
}
