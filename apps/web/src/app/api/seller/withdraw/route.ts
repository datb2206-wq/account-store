import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requestSellerWithdrawal } from '@accszone/core';
import { parseBody, userRoute } from '@/lib/admin-route';
import { tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  amount: z.preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().trim().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Enter a valid amount')),
  method: z.enum(['balance', 'bank']),
  bankName: z.string().trim().max(100).optional(),
  accountNo: z.string().trim().max(50).optional(),
  accountName: z.string().trim().max(100).optional(),
});

// CTV rút tiền bán hàng: vào số dư mua hàng (tức thì) hoặc về ngân hàng (admin duyệt)
export const POST = userRoute(async (req, _ctx, user) => {
  const limit = await rateLimit(`seller:withdraw:${user.id}`, 10, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const input = await parseBody(req, schema, 'Please check the highlighted fields');
  const w = await requestSellerWithdrawal(user.id, input);
  return NextResponse.json({ id: w.id, status: w.status }, { status: 201 });
});
