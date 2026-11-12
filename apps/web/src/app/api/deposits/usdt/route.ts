import { NextResponse } from 'next/server';
import { parseBody, userRoute } from '@/lib/admin-route';
import { createUsdtDeposit } from '@accszone/core';
import { getClientIp, tooManyRequests } from '@/lib/http';
import { blockedIpResponse } from '@/lib/ip-block';
import { rateLimit } from '@/lib/rate-limit';
import { usdtDepositSchema } from '@/lib/validation';

export const POST = userRoute(async (req, _ctx, user) => {
  const blocked = await blockedIpResponse(getClientIp(req));
  if (blocked) return blocked;
  const limit = await rateLimit(`deposit:create:${user.id}`, 10, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const input = await parseBody(req, usdtDepositSchema, 'Please check the highlighted fields');
  const deposit = await createUsdtDeposit(user.id, input);
  return NextResponse.json({ deposit }, { status: 201 });
});
