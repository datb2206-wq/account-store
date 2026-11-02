import { NextResponse } from 'next/server';
import { manualRefundOrder } from '@accszone/core';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { refundOrderSchema } from '@/lib/admin-schemas';

type Ctx = { params: Promise<{ id: string }> };

// Hoàn tiền thủ công (toàn bộ hoặc 1 phần) — chỉ SUPER_ADMIN vì là thao tác chuyển tiền
export const POST = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { id } = await params;
    const { amount, reason } = await parseBody(req, refundOrderSchema);
    const result = await manualRefundOrder({ orderId: id, amount, actorId: user.id, reason });
    return NextResponse.json({ amount: result.amount.toFixed(6), full: result.full });
  },
  { superAdminOnly: true },
);
