import { z } from 'zod';
import { decrypt } from '@accszone/core';
import { prisma, type Prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp } from '@/lib/http';

const MAX_EXPORT = 50_000;

const schema = z.object({
  productId: z.string().min(1).max(50),
  status: z.enum(['AVAILABLE', 'INVALID', 'SOLD']),
  batch: z.string().trim().max(50).optional(),
  limit: z.number().int().min(1).max(MAX_EXPORT).optional(),
  // Xuất rồi xóa khỏi kho (rút hàng ra): chỉ áp dụng hàng chưa bán, chưa gắn đơn
  remove: z.boolean().default(false),
});

// Xuất nội dung gốc ra file TXT (mỗi dòng 1 tài khoản). Cần quyền xem nội dung kho; mỗi lần xuất ghi audit log.
export const POST = adminRoute(async (req, _ctx, user) => {
  const { productId, status, batch, limit, remove } = await parseBody(req, schema);
  if (remove && status === 'SOLD') throw badRequest('Không xóa được hàng đã bán');
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { slug: true } });
  if (!product) throw notFound('Sản phẩm không tồn tại');

  const where: Prisma.StockItemWhereInput = { productId, status, ...(batch && { importBatch: batch }), ...(remove && { orderId: null }) };
  const take = limit ?? MAX_EXPORT;

  const lines = await prisma.$transaction(async (tx) => {
    const items = await tx.stockItem.findMany({ where, orderBy: { createdAt: 'asc' }, take, select: { id: true, content: true } });
    if (remove && items.length) {
      // Điều kiện status nằm trong câu DELETE: hàng vừa bị khách mua song song sẽ không bị xóa
      const { count } = await tx.stockItem.deleteMany({ where: { id: { in: items.map((i) => i.id) }, status, orderId: null } });
      if (count !== items.length) throw badRequest('Kho vừa thay đổi (có người mua), hãy thử lại');
    }
    return items.map((i) => decrypt(i.content));
  }, { timeout: 60_000 });

  if (remove && lines.length) await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({
    actorId: user.id,
    action: remove ? 'stock.export_remove' : 'stock.export',
    entity: 'Product',
    entityId: productId,
    after: { status, batch, count: lines.length },
    ip: getClientIp(req),
  });

  const name = `${product.slug}-${status.toLowerCase()}-${lines.length}.txt`;
  return new Response(lines.join('\n'), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${name}"`,
      'cache-control': 'no-store',
      'x-count': String(lines.length),
    },
  });
});
