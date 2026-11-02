import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, conflict, notFound, parseBody } from '@/lib/admin-route';
import { productSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const data = await parseBody(req, productSchema);
  const before = await prisma.product.findUnique({ where: { id } });
  if (!before) throw notFound('Sản phẩm không tồn tại');
  if (!(await prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } }))) {
    throw badRequest('Danh mục không tồn tại', { categoryId: ['Danh mục không tồn tại'] });
  }

  const product = await prisma.product.update({ where: { id }, data });
  await writeAudit({
    actorId: user.id,
    action: 'product.update',
    entity: 'Product',
    entityId: id,
    before,
    after: product,
    ip: getClientIp(req),
  });
  return NextResponse.json({ product: { id } });
});

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { orders: true, stockItems: true } } },
  });
  if (!product) throw notFound('Sản phẩm không tồn tại');
  // Đơn hàng cũ cần giữ tham chiếu tới sản phẩm -> chỉ cho ẩn, không cho xóa
  if (product._count.orders > 0) {
    throw conflict('Sản phẩm đã có đơn hàng nên không thể xóa. Hãy tắt "Đang bán" để ẩn sản phẩm.');
  }

  // StockItem bị xóa theo (onDelete: Cascade)
  await prisma.product.delete({ where: { id } });
  await writeAudit({
    actorId: user.id,
    action: 'product.delete',
    entity: 'Product',
    entityId: id,
    before: product,
    ip: getClientIp(req),
  });
  return NextResponse.json({ ok: true });
});
