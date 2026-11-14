import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { badRequest, conflict, parseBody, userRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp } from '@/lib/http';
import { requireActiveSeller, sellerProduct, sellerProductSchema } from '@/lib/seller';

type Ctx = { params: Promise<{ id: string }> };

// CTV sửa sản phẩm của mình. Sản phẩm bị từ chối -> gửi duyệt lại. Chỉ bật bán được khi đã duyệt.
export const PUT = userRoute<Ctx>(async (req, { params }, user) => {
  const { seller, settings } = await requireActiveSeller(user.id);
  const { id } = await params;
  const before = await sellerProduct(seller.id, id);
  const input = await parseBody(req, sellerProductSchema, 'Please check the highlighted fields');
  const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } });
  if (!category) throw badRequest('Choose a category', { categoryId: ['Choose a category'] });

  const approval = before.approval === 'REJECTED' ? (settings.autoApproveProducts ? 'APPROVED' : 'PENDING') : before.approval;
  await prisma.product.update({
    where: { id },
    data: {
      categoryId: category.id,
      name: { ...(before.name as object), en: input.name },
      description: { ...((before.description as object) ?? {}), en: input.description },
      price: input.price.toFixed(6),
      minQty: input.minQty,
      maxQty: input.maxQty,
      approval,
      ...(approval !== before.approval && { rejectReason: null }),
      isActive: approval === 'APPROVED' && input.isActive,
    },
  });
  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: 'seller.product.update', entity: 'Product', entityId: id, before: { price: before.price, isActive: before.isActive }, after: input, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});

// Xóa sản phẩm chưa có đơn hàng (hàng trong kho bị xóa theo)
export const DELETE = userRoute<Ctx>(async (req, { params }, user) => {
  const { seller } = await requireActiveSeller(user.id);
  const { id } = await params;
  await sellerProduct(seller.id, id);
  if (await prisma.order.count({ where: { productId: id } })) throw conflict('This product has orders and cannot be deleted. Turn it off instead.');
  await prisma.product.delete({ where: { id } });
  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: 'seller.product.delete', entity: 'Product', entityId: id, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
