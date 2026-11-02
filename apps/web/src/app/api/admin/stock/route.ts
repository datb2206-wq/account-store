import { NextResponse } from 'next/server';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { stockActionSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

// Thao tác hàng loạt trên kho. Hàng SOLD/RESERVED KHÔNG BAO GIỜ bị đụng tới:
// điều kiện status nằm ngay trong câu UPDATE/DELETE nên an toàn kể cả khi đang có người mua song song.
export const POST = adminRoute(async (req, _ctx, user) => {
  const { productId, action, ids, batch } = await parseBody(req, stockActionSchema);
  // orderId: null -> không bao giờ đụng hàng đã giao cho khách (kể cả hàng INVALID do đổi bảo hành)
  const scope: Prisma.StockItemWhereInput = { productId, orderId: null, ...(ids ? { id: { in: ids } } : { importBatch: batch }) };

  let count: number;
  switch (action) {
    case 'invalidate':
      ({ count } = await prisma.stockItem.updateMany({
        where: { ...scope, status: 'AVAILABLE' },
        data: { status: 'INVALID' },
      }));
      break;
    case 'restore':
      ({ count } = await prisma.stockItem.updateMany({
        where: { ...scope, status: 'INVALID' },
        data: { status: 'AVAILABLE' },
      }));
      break;
    case 'delete':
      ({ count } = await prisma.stockItem.deleteMany({
        where: { ...scope, status: { in: ['AVAILABLE', 'INVALID'] } },
      }));
      break;
  }

  await writeAudit({
    actorId: user.id,
    action: `stock.${action}`,
    entity: 'Product',
    entityId: productId,
    after: { count, batch, ids },
    ip: getClientIp(req),
  });
  return NextResponse.json({ count });
});
