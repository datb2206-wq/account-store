import { NextResponse } from 'next/server';
import { z } from 'zod';
import { setSellerStatus } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { invalidateCache, SHOP_STOCK_CACHE } from '@/lib/cache';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  status: z.enum(['ACTIVE', 'SUSPENDED', 'REJECTED']).optional(),
  note: z.string().trim().max(1000).optional(),
  // null = dùng phí sàn mặc định
  commissionPercent: z.number().min(0).max(90).nullable().optional(),
});

// Duyệt / từ chối / khóa / mở lại CTV, đặt phí sàn riêng
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const input = await parseBody(req, schema);
  const before = await prisma.seller.findUnique({ where: { id }, select: { status: true, commissionPercent: true, adminNote: true } });
  if (!before) throw notFound('Không tìm thấy CTV');
  if (input.commissionPercent !== undefined) {
    await prisma.seller.update({ where: { id }, data: { commissionPercent: input.commissionPercent } });
  }
  if (input.status) await setSellerStatus(id, input.status, input.note);
  else if (input.note !== undefined) await prisma.seller.update({ where: { id }, data: { adminNote: input.note } });
  await invalidateCache(SHOP_STOCK_CACHE);
  await writeAudit({ actorId: user.id, action: 'ctv.seller.update', entity: 'Seller', entityId: id, before, after: input, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
