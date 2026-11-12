import type { Metadata } from 'next';
import { prisma } from '@accszone/database';
import { ActionButton, QuickForm } from '@/components/admin/quick-form';
import { PageHeader, Panel } from '@/components/admin/ui';
import { LocalTime } from '@/components/local-time';
import { requireStaff } from '@/lib/auth';
import { formatUsd, localized } from '@/lib/format';

export const metadata: Metadata = { title: 'Mã giảm giá' };

export default async function CouponsPage() {
  const admin = await requireStaff();
  const [coupons, products, discounts] = await Promise.all([
    prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.product.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
    prisma.order.groupBy({ by: ['couponId'], where: { couponId: { not: null }, status: { in: ['COMPLETED', 'PENDING'] } }, _sum: { discountAmount: true } }),
  ]);
  const productName = new Map(products.map((p) => [p.id, localized(p.name)]));
  const discountOf = new Map(discounts.map((d) => [d.couponId, d._sum.discountAmount]));
  const superAdmin = admin.role === 'SUPER_ADMIN';
  const now = new Date();

  return (
    <div className="space-y-5">
      <PageHeader title="Mã giảm giá" count={coupons.length} />

      {superAdmin && (
        <Panel title="Tạo mã giảm giá mới">
          <QuickForm
            url="/api/admin/coupons"
            submitLabel="+ Tạo mã giảm giá"
            columns={3}
            fields={[
              { name: 'code', label: 'Mã giảm giá', placeholder: 'VD: SALE10', required: true, hint: 'Khách nhập mã này khi mua (không phân biệt hoa thường)' },
              { name: 'discountPercent', label: 'Giảm (%)', type: 'number', step: '0.01', placeholder: '10', required: true },
              { name: 'maxUses', label: 'Số lượt dùng', type: 'number', placeholder: '100', required: true },
              { name: 'maxDiscount', label: 'Giảm tối đa (USD)', placeholder: 'Để trống = không giới hạn' },
              { name: 'minOrder', label: 'Đơn tối thiểu (USD)', placeholder: 'Để trống = không yêu cầu' },
              { name: 'expiresAt', label: 'Hết hạn (hết ngày)', type: 'date', hint: 'Để trống = không hết hạn' },
              {
                name: 'productIds', label: 'Sản phẩm áp dụng', type: 'multiselect', span: 2,
                options: products.map((p) => ({ value: p.id, label: localized(p.name) })),
                hint: 'Không chọn = áp dụng cho mọi sản phẩm. Giữ Ctrl để chọn nhiều.',
              },
              { name: 'isActive', label: 'Bật ngay', type: 'checkbox' },
            ]}
          />
        </Panel>
      )}

      <Panel title="Danh sách mã giảm giá" bodyClassName="overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Mã</th><th>Giảm</th><th>Sản phẩm áp dụng</th><th>Đã dùng</th><th>Tổng đã giảm</th><th>Hết hạn</th><th>Trạng thái</th><th /></tr>
          </thead>
          <tbody>
            {coupons.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-zinc-400">Chưa có mã giảm giá nào</td></tr>}
            {coupons.map((c) => {
              const expired = c.expiresAt && c.expiresAt < now;
              const usedUp = c.usedCount >= c.maxUses;
              const live = c.isActive && !expired && !usedUp;
              return (
                <tr key={c.id} className="odd:bg-zinc-50/60">
                  <td className="font-mono font-semibold text-indigo-600">{c.code}</td>
                  <td className="whitespace-nowrap">
                    <b>{Number(c.discountPercent)}%</b>
                    {c.maxDiscount && <p className="text-xs text-zinc-400">tối đa {formatUsd(c.maxDiscount)}</p>}
                    {c.minOrder && <p className="text-xs text-zinc-400">đơn từ {formatUsd(c.minOrder)}</p>}
                  </td>
                  <td className="max-w-xs text-xs">
                    {c.productIds.length === 0 ? <span className="text-zinc-500">Mọi sản phẩm</span> : c.productIds.map((id) => productName.get(id) ?? '(đã ẩn/xóa)').join(', ')}
                  </td>
                  <td className="tabular-nums">{c.usedCount} / {c.maxUses}</td>
                  <td className="text-emerald-600 tabular-nums">{formatUsd(discountOf.get(c.id))}</td>
                  <td className="text-xs whitespace-nowrap text-zinc-500">{c.expiresAt ? <LocalTime value={c.expiresAt} /> : 'Không'}</td>
                  <td>
                    <span className={`rounded px-2 py-0.5 text-xs font-medium ${live ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>
                      {!c.isActive ? 'Đã tắt' : expired ? 'Hết hạn' : usedUp ? 'Hết lượt' : 'Đang chạy'}
                    </span>
                  </td>
                  <td className="space-x-1 text-right whitespace-nowrap">
                    {superAdmin && (
                      <>
                        <ActionButton url={`/api/admin/coupons/${c.id}`} method="PATCH" body={{ isActive: !c.isActive }} label={c.isActive ? 'Tắt' : 'Bật'} className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100" />
                        <ActionButton url={`/api/admin/coupons/${c.id}`} confirmText={`Xóa mã ${c.code}?`} label="Xóa" />
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      {!superAdmin && <p className="text-xs text-zinc-400">Chỉ Super Admin được tạo / sửa mã giảm giá.</p>}
    </div>
  );
}
