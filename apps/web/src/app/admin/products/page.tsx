import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@accszone/database';
import { BulkAllCheckbox, BulkCheckbox, ProductBulkBar, ProductBulkProvider } from '@/components/admin/product-bulk';
import { Badge } from '@/components/badge';
import { Pagination } from '@/components/pagination';
import { productWhere } from '@/lib/admin-products';
import { requireStaff } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { treeOptions } from '@/lib/category-tree';
import { formatUsd, localized } from '@/lib/format';
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
  const status = params.status === 'active' || params.status === 'inactive' ? params.status : '';
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  const where = productWhere({ q, category, status });

  const [total, products, categories] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { category: { select: { name: true } } },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], select: { id: true, parentId: true, name: true } }),
  ]);

  const stock = await prisma.stockItem.groupBy({
    by: ['productId'],
    where: { productId: { in: products.map((p) => p.id) }, status: 'AVAILABLE' },
    _count: true,
  });
  const available = new Map(stock.map((s) => [s.productId, s._count]));
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Sản phẩm <span className="text-base font-normal text-zinc-400">({total})</span></h1>
        <Link href="/admin/products/new" className="btn-primary">+ Thêm sản phẩm</Link>
      </div>

      <form className="flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Tìm theo tên (EN) hoặc slug…" className="input w-64" />
        <select name="category" defaultValue={category} className="input w-56">
          <option value="">Tất cả danh mục</option>
          {treeOptions(categories).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input w-40">
          <option value="">Mọi trạng thái</option>
          <option value="active">Đang bán</option>
          <option value="inactive">Đã ẩn</option>
        </select>
        <button className="btn-primary">Lọc</button>
        {(q || category || status) && <Link href="/admin/products" className="btn-ghost">Xóa lọc</Link>}
      </form>

      <ProductBulkProvider ids={editable ? products.map((p) => p.id) : []}>
      {editable && <ProductBulkBar total={total} filter={{ q, category, status }} categories={treeOptions(categories)} />}
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>{editable && <th className="w-8"><BulkAllCheckbox /></th>}<th>Sản phẩm</th><th>Danh mục</th><th>Giá bán</th><th>Giá vốn</th><th>Còn hàng</th><th>Trạng thái</th><th /></tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr><td colSpan={editable ? 8 : 7} className="py-10 text-center text-zinc-500">Không có sản phẩm nào.</td></tr>
            )}
            {products.map((p) => {
              const inStock = p.source === 'LOCAL' ? (available.get(p.id) ?? 0) : (p.externalStock ?? 0);
              return (
                <tr key={p.id}>
                  {editable && <td><BulkCheckbox id={p.id} /></td>}
                  <td>
                    <Link href={`/admin/products/${p.id}`} className="font-medium hover:text-blue-600">{localized(p.name)}</Link>
                    <p className="font-mono text-xs text-zinc-400">{p.slug}</p>
                  </td>
                  <td className="text-zinc-600">{localized(p.category.name)}</td>
                  <td className="tabular-nums">{formatUsd(p.price)}</td>
                  <td className="tabular-nums text-zinc-500">{p.costPrice ? formatUsd(p.costPrice) : '—'}</td>
                  <td className={`tabular-nums font-medium ${inStock === 0 ? 'text-red-600' : ''}`}>
                    {inStock.toLocaleString()}
                    {p.source === 'RESELLER' && <span className="ml-1 text-xs font-normal text-zinc-400">(web gốc)</span>}
                  </td>
                  <td className="space-x-1">
                    <Badge value={p.isActive ? 'Đang bán' : 'Đã ẩn'} tone={p.isActive ? 'green' : 'gray'} />
                    {p.source === 'RESELLER' && <Badge value="RESELLER" tone="blue" />}
                  </td>
                  <td className="space-x-3 text-right text-sm font-medium whitespace-nowrap">
                    <Link href={`/admin/products/${p.id}`} className="text-blue-600 hover:underline">Sửa</Link>
                    <Link href={`/admin/products/${p.id}/stock`} className="text-blue-600 hover:underline">Kho</Link>
                  </td>
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
