import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { productSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

export const POST = adminRoute(async (req, _ctx, user) => {
  const data = await parseBody(req, productSchema);
  if (!(await prisma.category.findUnique({ where: { id: data.categoryId }, select: { id: true } }))) {
    throw badRequest('Danh mục không tồn tại', { categoryId: ['Danh mục không tồn tại'] });
  }

  // Sản phẩm tạo tay luôn là LOCAL; sản phẩm RESELLER do job đồng bộ từ web gốc tạo ra
  const product = await prisma.product.create({ data: { ...data, source: 'LOCAL' } });
  await writeAudit({
    actorId: user.id,
    action: 'product.create',
    entity: 'Product',
    entityId: product.id,
    after: product,
    ip: getClientIp(req),
  });
  return NextResponse.json({ product: { id: product.id } }, { status: 201 });
});
