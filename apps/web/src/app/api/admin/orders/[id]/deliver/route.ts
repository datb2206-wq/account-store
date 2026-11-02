import { NextResponse } from 'next/server';
import { deliverOrder } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, conflict, notFound, parseBody } from '@/lib/admin-route';
import { deliverOrderSchema } from '@/lib/admin-schemas';

type Ctx = { params: Promise<{ id: string }> };

// Giao tay: admin tự lấy được tài khoản (VD liên hệ trực tiếp nhà cung cấp) và dán vào.
// Ít hơn số lượng đặt -> tự hoàn tiền phần thiếu; nhiều hơn -> chỉ lấy đủ số lượng.
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { accounts } = await parseBody(req, deliverOrderSchema);
  const order = await prisma.order.findUnique({ where: { id }, select: { status: true } });
  if (!order) throw notFound('Không tìm thấy đơn hàng');
  if (order.status !== 'PENDING') throw badRequest('Chỉ giao tay cho đơn đang PENDING');

  const lines = accounts.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const outcome = await deliverOrder(id, null, lines, user.id);
  if (outcome === 'skipped') throw conflict('Đơn vừa được xử lý bởi tiến trình khác');
  return NextResponse.json({ outcome });
});
