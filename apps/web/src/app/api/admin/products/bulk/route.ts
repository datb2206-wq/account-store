import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { productWhere } from '@/lib/admin-products';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp } from '@/lib/http';

const id = z.string().min(1).max(50);
const schema = z
  .object({
    action: z.enum(['enable', 'disable', 'delete', 'category']),
    ids: z.array(id).min(1).max(1000).optional(),
    // Áp dụng cho TẤT CẢ sản phẩm khớp bộ lọc (không chỉ trang đang xem)
    filter: z.object({ q: z.string().max(200).optional(), category: z.string().max(50).optional(), status: z.string().max(20).optional() }).optional(),
    categoryId: id.optional(),
  })
  .refine((d) => !!d.ids !== !!d.filter, 'Chọn sản phẩm HOẶC áp dụng theo bộ lọc')
  .refine((d) => d.action !== 'category' || !!d.categoryId, 'Chọn danh mục đích');

// Thao tác hàng loạt trên sản phẩm: bật bán / ẩn / chuyển danh mục / xóa (chỉ xóa sản phẩm chưa có đơn hàng)
export const POST = adminRoute(async (req, _ctx, user) => {
  const { action, ids, filter, categoryId } = await parseBody(req, schema);
  const where: Prisma.ProductWhereInput = ids ? { id: { in: ids } } : productWhere(filter!);

  let count = 0;
  let skipped = 0;
  if (action === 'enable' || action === 'disable') {
    ({ count } = await prisma.product.updateMany({ where, data: { isActive: action === 'enable' } }));
  } else if (action === 'category') {
    const cat = await prisma.category.findUnique({ where: { id: categoryId! }, select: { id: true } });
    if (!cat) throw notFound('Danh mục không tồn tại');
    ({ count } = await prisma.product.updateMany({ where, data: { categoryId: cat.id } }));
  } else {
    // Đơn hàng cũ giữ tham chiếu tới sản phẩm -> sản phẩm đã có đơn chỉ được ẩn
    const total = await prisma.product.count({ where });
    if (total > 5000) throw badRequest('Tối đa 5.000 sản phẩm mỗi lần xóa, hãy lọc hẹp hơn');
    ({ count } = await prisma.product.deleteMany({ where: { AND: [where, { orders: { none: {} } }] } }));
    skipped = total - count;
  }

  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: `product.bulk_${action}`, entity: 'Product', after: { ids, filter, categoryId, count, skipped }, ip: getClientIp(req) });
  return NextResponse.json({ count, skipped });
});
