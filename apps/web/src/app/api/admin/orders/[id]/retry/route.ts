import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { retryOrderFulfillment, workerOnline } from '@/lib/queue';

type Ctx = { params: Promise<{ id: string }> };

// Đơn RESELLER đang kẹt: chạy job giao hàng ngay (không chờ lịch quét / backoff)
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const order = await prisma.order.findUnique({ where: { id }, select: { status: true, supplierId: true } });
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  if (order.status !== 'PENDING' || !order.supplierId) throw badRequest('Chỉ áp dụng cho đơn RESELLER đang PENDING');

  const [result, online] = await Promise.all([retryOrderFulfillment(id), workerOnline()]);
  await writeAudit({ actorId: user.id, action: 'order.retry', entity: 'Order', entityId: id, after: { result }, ip: getClientIp(req) });
  return NextResponse.json({ result, workerOnline: online });
});
