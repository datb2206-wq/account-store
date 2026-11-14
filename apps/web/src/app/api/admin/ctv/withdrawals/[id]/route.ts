import { NextResponse } from 'next/server';
import { z } from 'zod';
import { reviewSellerWithdrawal } from '@accszone/core';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Duyệt (đã chuyển khoản) / từ chối (trả lại tiền cho CTV) lệnh rút về ngân hàng
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { approve, note } = await parseBody(req, z.object({ approve: z.boolean(), note: z.string().trim().max(500).default('') }));
  const w = await reviewSellerWithdrawal(id, user.id, approve, note);
  await writeAudit({ actorId: user.id, action: approve ? 'ctv.withdraw.approve' : 'ctv.withdraw.reject', entity: 'SellerWithdrawal', entityId: id, after: { amount: w.amount, note }, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
