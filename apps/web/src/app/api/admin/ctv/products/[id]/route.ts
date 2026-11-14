import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Duyệt (hiện lên web) / từ chối (kèm lý do) sản phẩm do CTV đăng
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { approve, reason } = await parseBody(req, z.object({ approve: z.boolean(), reason: z.string().trim().max(500).default('') }));
  const p = await prisma.product.findUnique({ where: { id }, select: { sellerId: true, approval: true, seller: { select: { status: true } } } });
  if (!p?.sellerId) throw notFound('Không phải sản phẩm của CTV');
  if (approve && p.seller?.status !== 'ACTIVE') throw badRequest('CTV này không còn hoạt động');
  if (!approve && !reason) throw badRequest('Nhập lý do từ chối để CTV sửa lại');
  await prisma.product.update({
    where: { id },
    data: approve ? { approval: 'APPROVED', rejectReason: null, isActive: true } : { approval: 'REJECTED', rejectReason: reason, isActive: false },
  });
  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: approve ? 'ctv.product.approve' : 'ctv.product.reject', entity: 'Product', entityId: id, before: { approval: p.approval }, after: { reason }, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
