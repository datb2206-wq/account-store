import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma, prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp } from '@/lib/http';

const schema = z.object({
  productId: z.string().min(1).max(50),
  targetId: z.string().min(1).max(50),
  status: z.enum(['AVAILABLE', 'INVALID']).default('AVAILABLE'),
  batch: z.string().trim().max(50).optional(),
  limit: z.number().int().min(1).max(1_000_000).optional(),
});

// Chuyển hàng chưa bán sang sản phẩm khác (VD nhập nhầm sản phẩm). Tài khoản đã có ở sản phẩm đích (trùng nội dung) được giữ lại.
export const POST = adminRoute(async (req, _ctx, user) => {
  const { productId, targetId, status, batch, limit } = await parseBody(req, schema);
  if (productId === targetId) throw badRequest('Sản phẩm đích phải khác sản phẩm hiện tại');
  const [source, target] = await Promise.all([
    prisma.product.findUnique({ where: { id: productId }, select: { id: true } }),
    prisma.product.findUnique({ where: { id: targetId }, select: { id: true, source: true } }),
  ]);
  if (!source || !target) throw notFound('Sản phẩm không tồn tại');
  if (target.source !== 'LOCAL') throw badRequest('Chỉ chuyển được sang sản phẩm bán từ kho (không phải sản phẩm API)');

  // CTE MATERIALIZED: chọn đúng 1 lần (IN (subquery LIMIT … FOR UPDATE) có thể bị chạy lại và chuyển quá số lượng)
  const moved = await prisma.$executeRaw(Prisma.sql`
    WITH picked AS MATERIALIZED (
      SELECT c.id FROM stock_items c
      WHERE c."productId" = ${productId} AND c.status = ${status}::"StockStatus" AND c."orderId" IS NULL
        ${batch ? Prisma.sql`AND c."importBatch" = ${batch}` : Prisma.empty}
        AND NOT EXISTS (SELECT 1 FROM stock_items t WHERE t."productId" = ${targetId} AND t."contentHash" = c."contentHash")
      ORDER BY c."createdAt"
      ${limit ? Prisma.sql`LIMIT ${limit}` : Prisma.empty}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE stock_items s SET "productId" = ${targetId}, "updatedAt" = now()
    FROM picked
    WHERE s.id = picked.id AND s.status = ${status}::"StockStatus" AND s."orderId" IS NULL`);

  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: 'stock.move', entity: 'Product', entityId: productId, after: { targetId, status, batch, limit, moved }, ip: getClientIp(req) });
  return NextResponse.json({ moved });
});
