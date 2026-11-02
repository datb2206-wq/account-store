import { NextResponse } from 'next/server';
import { replaceOrderItems } from '@accszone/core';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { replaceItemsSchema } from '@/lib/admin-schemas';

type Ctx = { params: Promise<{ id: string }> };

// Đổi hàng bảo hành cho đơn hàng kho (LOCAL)
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { itemIds, reason } = await parseBody(req, replaceItemsSchema);
  const result = await replaceOrderItems({ orderId: id, itemIds, actorId: user.id, reason });
  return NextResponse.json({ replaced: result.newIds.length });
});
