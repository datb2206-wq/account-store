import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { BulkAllCheckbox, BulkCheckbox, ProductBulkBar, ProductBulkProvider, ProductOrderControl } from '@/components/admin/product-bulk';
import { ProductActiveToggle, ProductRowActions } from '@/components/admin/product-row-controls';
import { Badge } from '@/components/badge';
import { Pagination } from '@/components/pagination';
import { productWhere } from '@/lib/admin-products';
import { requireStaff } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { treeOptions } from '@/lib/category-tree';
import { formatDate, formatUsd, localized } from '@/lib/format';
import { buildHref } from '@/lib/url';

export const metadata: Metadata = { title: 'Sản phẩm' };

const PAGE_SIZE = 20;

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; status?: string; page?: string }>;
}) {
  const user = await requireStaff();
  const editable = can(user, 'products.edit');
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const category = params.category ?? '';
  const status = params.status === 'active' || params.status === 'inactive' || params.status === 'featured' ? params.status : '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const where = productWhere({ q, category, status });

  const [total, products, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      // Cùng thứ tự với trang chủ: nổi bật trước, rồi theo số thứ tự
      orderBy: [{ isFeatured: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: { select: { name: true } }, seller: { select: { shopName: true } }, supplier: { select: { name: true } } },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, parentId: true, name: true } }),
  ]);

  const ids = products.map((p) => p.id);
  const [stock, soldRows] = await Promise.all([
    prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: ids }, status: 'AVAILABLE' }, _count: true }),
    // Đã bán = tổng số lượng của các đơn hoàn tất
    prisma.order.groupBy({ by: ['productId'], where: { productId: { in: ids }, status: 'COMPLETED' }, _sum: { quantity: true } }),
  ]);
  const available = new Map(stock.map((s) => [s.productId, s._count]));
  const sold = new Map(soldRows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Sản phẩm <span className="text-base font-normal text-zinc-400">({total})</span></h1>
        <div className="flex flex-wrap gap-2">
          {/* Thẻ a thường (không prefetch): tải file CSV theo đúng bộ lọc đang xem */}
          {editable && <a href={buildHref('/api/admin/products/export', { q: q || undefined, category: category || undefined, status: status || undefined })} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700" title="Tải file CSV (Excel / Google Sheets) các sản phẩm theo bộ lọc đang xem">⬇️ Xuất file ({total.toLocaleString('en-US')})</a>}
          <Link href="/admin/products/new" className="btn-primary">+ Thêm sản phẩm</Link>
        </div>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Tìm theo tên gốc, tên hiển thị hoặc slug…" className="input w-64" />
        <select name="category" defaultValue={category} className="input w-56">
          <option value="">Tất cả danh mục</option>
          {treeOptions(categories).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input w-40">
          <option value="">Mọi trạng thái</option>
          <option value="active">Đang bán</option>
          <option value="inactive">Đã ẩn</option>
          <option value="featured">📌 Nổi bật</option>
        </select>
        <button className="btn-primary">Lọc</button>
        {(q || category || status) && <Link href="/admin/products" className="btn-ghost">Xóa lọc</Link>}
      </form>

      <ProductBulkProvider ids={editable ? products.map((p) => p.id) : []}>
      {editable && <ProductBulkBar total={total} filter={{ q, category, status }} categories={treeOptions(categories)} />}
      <div className="card overflow-x-auto p-0">
        <table className="table min-w-[1100px]">
          <thead>
            <tr>
              {editable && <th className="w-8"><BulkAllCheckbox /></th>}
              <th>Ưu tiên</th>
              <th>Thao tác</th>
              <th>Tên gốc (từ nguồn)</th>
              <th>Tên hiển thị (khách thấy)</th>
              <th>Chuyên mục</th>
              <th className="text-center">Trạng thái</th>
              <th>Giá</th>
              <th className="text-center">Tồn kho</th>
              <th>Chi tiết</th>
              <th>Người bán</th>
              <th>Thời gian</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr><td colSpan={editable ? 12 : 11} className="py-10 text-center text-zinc-500">Không có sản phẩm nào.</td></tr>
            )}
            {products.map((p) => {
              const inStock = p.source === 'LOCAL' ? (available.get(p.id) ?? 0) : (p.externalStock ?? 0);
              const name = localized(p.name);
              const nm = (p.name && typeof p.name === 'object' && !Array.isArray(p.name) ? p.name : {}) as Record<string, string>;
              const srcName = nm.src ?? nm.en ?? name;
              const shown = nm.pt ?? '';
              const margin = p.costPrice ? Number(p.price) - Number(p.costPrice) : null;
              return (
                <tr key={p.id} className="align-middle">
                  {editable && <td><BulkCheckbox id={p.id} /></td>}
                  <td className="whitespace-nowrap">
                    {editable ? <ProductOrderControl id={p.id} sortOrder={p.sortOrder} isFeatured={p.isFeatured} /> : <span className="tabular-nums">{p.isFeatured && '📌 '}{p.sortOrder}</span>}
                  </td>
                  <td>
                    <ProductRowActions id={p.id} name={name} reseller={p.source === 'RESELLER'} supplierId={p.supplierId} editable={editable} />
                  </td>
                  <td className="max-w-80">
                    <Link href={`/admin/products/${p.id}`} className="text-[13px] font-medium uppercase hover:text-blue-600">{srcName}</Link>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="font-mono text-[11px] text-zinc-400">{p.slug}</span>
                      {p.approval !== 'APPROVED' && <Badge value={p.approval === 'PENDING' ? 'Chờ duyệt' : 'Bị từ chối'} tone="gray" />}
                    </div>
                  </td>
                  <td className="max-w-80">
                    {shown ? (
                      <>
                        <p className="text-[13px] font-medium text-emerald-800">{shown}</p>
                        <p className="mt-0.5 text-[11px] text-zinc-400">{nm.lock ? '🔒 Đã khóa (đã duyệt)' : 'AI dịch, chưa khóa'}</p>
                      </>
                    ) : (
                      <span className="text-xs text-amber-600">Chưa dịch (khách thấy tên gốc)</span>
                    )}
                  </td>
                  <td className="text-sm text-zinc-600">{localized(p.category.name)}</td>
                  <td className="text-center">
                    <ProductActiveToggle id={p.id} active={p.isActive} disabled={!editable} />
                  </td>
                  <td className="text-[13px] whitespace-nowrap">
                    <p>Giá bán: <b className="text-red-600 tabular-nums">{formatUsd(p.price)}</b></p>
                    <p>Giá vốn: <b className="text-blue-600 tabular-nums">{p.costPrice ? formatUsd(p.costPrice) : '—'}</b></p>
                  </td>
                  <td className="text-center">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${inStock === 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>{inStock.toLocaleString('en-US')}</span>
                    {p.source === 'RESELLER' && <p className="mt-0.5 text-[10px] text-zinc-400">web nguồn</p>}
                  </td>
                  <td className="text-[13px] whitespace-nowrap">
                    <p>Còn hàng: <b className="text-emerald-600 tabular-nums">{inStock.toLocaleString('en-US')}</b></p>
                    <p>Đã bán: <b className="tabular-nums">{(sold.get(p.id) ?? 0).toLocaleString('en-US')}</b></p>
                    {margin !== null && <p>Lãi / 1: <b className={`tabular-nums ${margin < 0 ? 'text-red-600' : 'text-zinc-700'}`}>{formatUsd(margin)}</b></p>}
                  </td>
                  <td className="text-sm whitespace-nowrap">
                    {p.seller ? <span className="text-indigo-600">CTV · {p.seller.shopName}</span> : p.source === 'RESELLER' ? <span className="text-sky-600">API · {p.supplier?.name ?? 'đã xóa'}</span> : <span className="text-indigo-600">Admin</span>}
                  </td>
                  <td className="text-xs whitespace-nowrap text-zinc-500">{formatDate(p.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </ProductBulkProvider>

      <Pagination
        page={page}
        totalPages={totalPages}
        hrefFor={(p) => buildHref('/admin/products', { q, category, status, page: p > 1 ? p : undefined })}
      />
    </div>
  );
}
