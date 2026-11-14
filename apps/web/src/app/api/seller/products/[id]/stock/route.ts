import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { parseBody, userRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { importStockLines, requireActiveSeller, sellerProduct } from '@/lib/seller';

type Ctx = { params: Promise<{ id: string }> };

// CTV nhập hàng (mỗi dòng 1 tài khoản)
export const POST = userRoute<Ctx>(async (req, { params }, user) => {
  const { seller } = await requireActiveSeller(user.id);
  const { id } = await params;
  await sellerProduct(seller.id, id);
  const limit = await rateLimit(`seller:import:${user.id}`, 30, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const { content } = await parseBody(req, z.object({ content: z.string().min(1).max(5_000_000) }), 'Paste at least one line');
  const result = await importStockLines(id, content);
  await writeAudit({ actorId: user.id, action: 'seller.stock.import', entity: 'Product', entityId: id, after: result, ip: getClientIp(req) });
  return NextResponse.json(result, { status: 201 });
});

// CTV gỡ toàn bộ hàng CHƯA BÁN của sản phẩm (VD hàng lỗi)
export const DELETE = userRoute<Ctx>(async (req, { params }, user) => {
  const { seller } = await requireActiveSeller(user.id);
  const { id } = await params;
  await sellerProduct(seller.id, id);
  const { count } = await prisma.stockItem.deleteMany({ where: { productId: id, orderId: null, status: { in: ['AVAILABLE', 'INVALID'] } } });
  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: 'seller.stock.clear', entity: 'Product', entityId: id, after: { count }, ip: getClientIp(req) });
  return NextResponse.json({ count });
});
