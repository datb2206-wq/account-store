import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma, type ProductApproval } from '@accszone/database';
import { ProductReviewActions } from '@/components/admin/ctv-admin';
import { FilterBar, PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { formatUsd, localized } from '@/lib/format';
import { can } from '@/lib/permissions';

export const metadata: Metadata = { title: 'Sản phẩm CTV' };

const APPROVAL: Record<ProductApproval, [string, string]> = {
  PENDING: ['Chờ duyệt', 'bg-amber-50 text-amber-700'],
  APPROVED: ['Đã duyệt', 'bg-emerald-50 text-emerald-700'],
  REJECTED: ['Từ chối', 'bg-red-50 text-red-700'],
};

export default async function CtvProductsPage({ searchParams }: { searchParams: Promise<{ status?: string; seller?: string }> }) {
  const user = await requireStaff();
  const sp = await searchParams;
  // Mặc định chỉ hiện sản phẩm chờ duyệt; ?status=all để xem tất cả
  const approval = sp.status === 'all' ? undefined : sp.status && sp.status in APPROVAL ? (sp.status as ProductApproval) : 'PENDING';
  const editable = can(user, 'ctv.edit');

  const products = await prisma.product.findMany({
    where: { sellerId: sp.seller || { not: null }, approval },
    orderBy: { updatedAt: 'desc' },
    take: 200,
    include: { seller: { select: { shopName: true, status: true } }, category: { select: { name: true } } },
  });
  const stock = await prisma.stockItem.groupBy({ by: ['productId'], where: { productId: { in: products.map((p) => p.id) }, status: 'AVAILABLE' }, _count: true });
  const stockMap = new Map(stock.map((s) => [s.productId, s._count]));

  return (
    <div className="space-y-5">
      <PageHeader title="Sản phẩm CTV" count={products.length}>
        <Link href="/admin/ctv" className="btn-ghost border border-zinc-200">← CTV</Link>
      </PageHeader>
      <p className="text-sm text-zinc-500">Duyệt thì sản phẩm hiện trên web ngay. Từ chối kèm lý do, CTV sửa lại sẽ tự gửi duyệt lại. Sản phẩm đã duyệt quản lý như sản phẩm thường ở trang Sản phẩm.</p>
      <Panel title="Danh sách" bodyClassName="space-y-4 p-5">
        <FilterBar resetHref="/admin/ctv/products" active={sp.status !== undefined || !!sp.seller}>
          <select name="status" defaultValue={sp.status ?? 'PENDING'} className="input w-44">
            <option value="all">Mọi trạng thái</option>
            {(Object.keys(APPROVAL) as ProductApproval[]).map((k) => <option key={k} value={k}>{APPROVAL[k][0]}</option>)}
          </select>
          {sp.seller && <input type="hidden" name="seller" value={sp.seller} />}
        </FilterBar>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Sản phẩm</th><th>CTV</th><th>Danh mục</th><th>Giá</th><th>Kho</th><th>Trạng thái</th><th /></tr></thead>
            <tbody>
              {products.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-zinc-400">Không có sản phẩm nào</td></tr>}
              {products.map((p) => {
                const [label, tone] = APPROVAL[p.approval];
                const description = localized(p.description);
                return (
                  <tr key={p.id} className="odd:bg-zinc-50/60 align-top">
                    <td className="max-w-md">
                      <Link href={`/admin/products/${p.id}`} className="font-medium hover:text-indigo-600">{localized(p.name)}</Link>
                      {description && <p className="line-clamp-3 text-xs whitespace-pre-line text-zinc-500">{description}</p>}
                      <p className="text-[11px] text-zinc-400">Cập nhật <LocalTime value={p.updatedAt} /></p>
                    </td>
                    <td className="text-sm">{p.seller?.shopName ?? '—'}{p.seller?.status !== 'ACTIVE' && <span className="ml-1 text-xs text-red-600">(không hoạt động)</span>}</td>
                    <td className="text-sm text-zinc-600">{localized(p.category.name)}</td>
                    <td className="tabular-nums">{formatUsd(p.price)}</td>
                    <td className="tabular-nums">
                      {(stockMap.get(p.id) ?? 0).toLocaleString('en-US')}
                      <Link href={`/admin/products/${p.id}/stock`} className="ml-2 text-xs text-indigo-600 hover:underline">Xem kho</Link>
                    </td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${tone}`}>{label}</span>
                      {p.rejectReason && <p className="mt-1 max-w-40 text-xs text-zinc-500">{p.rejectReason}</p>}
                    </td>
                    <td className="text-right">{editable && p.approval !== 'APPROVED' && <ProductReviewActions id={p.id} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
