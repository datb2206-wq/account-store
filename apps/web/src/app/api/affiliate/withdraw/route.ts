import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { requestWithdrawal } from '@accszone/core';
import { parseBody, userRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  amount: z.preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().trim().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Enter a valid amount')),
  method: z.enum(['balance', 'bank']),
  bankName: z.string().trim().max(100).optional(),
  accountNo: z.string().trim().max(50).optional(),
  accountName: z.string().trim().max(100).optional(),
});

// Khách rút hoa hồng giới thiệu (vào số dư ngay, hoặc về ngân hàng chờ admin duyệt)
export const POST = userRoute(async (req, _ctx, user) => {
  const limit = await rateLimit(`affwd:${user.id}`, 10, 3600);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const input = await parseBody(req, schema, 'Please check the highlighted fields');
  const w = await requestWithdrawal(user.id, input);
  const ip = getClientIp(req);
  after(() => writeAudit({ actorId: user.id, action: 'affiliate.withdraw', entity: 'AffiliateWithdrawal', entityId: w.id, after: { amount: input.amount, method: input.method }, ip }).catch(() => null));
  return NextResponse.json({ withdrawal: { id: w.id, status: w.status } }, { status: 201 });
});
