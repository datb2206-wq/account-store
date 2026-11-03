import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, notFound } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Bật bán hàng loạt: mọi sản phẩm đang ẩn của nhà cung cấp này mà web gốc còn hàng.
// Sản phẩm đồng bộ về mặc định ẩn để admin kiểm tra giá/markup trước; nút này dùng sau khi đã kiểm tra.
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const supplier = await prisma.supplier.findUnique({ where: { id }, select: { id: true } });
  if (!supplier) throw notFound('Nhà cung cấp không tồn tại');

  const { count } = await prisma.product.updateMany({
    where: { supplierId: id, isActive: false, externalStock: { gt: 0 } },
    data: { isActive: true },
  });
  await writeAudit({ actorId: user.id, action: 'supplier.publish', entity: 'Supplier', entityId: id, after: { published: count }, ip: getClientIp(req) });
  return NextResponse.json({ published: count });
});
