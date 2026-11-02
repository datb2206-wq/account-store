import { NextResponse } from 'next/server';
import { parseBody, userRoute } from '@/lib/admin-route';
import { createBankDeposit } from '@accszone/core';
import { tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { bankDepositSchema } from '@/lib/validation';

export const POST = userRoute(async (req, _ctx, user) => {
  const limit = await rateLimit(`deposit:create:${user.id}`, 10, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const input = await parseBody(req, bankDepositSchema, 'Please check the highlighted fields');
  const deposit = await createBankDeposit(user.id, input);
  return NextResponse.json({ deposit }, { status: 201 });
});
