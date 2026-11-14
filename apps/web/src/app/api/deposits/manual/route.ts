import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createManualDeposit } from '@accszone/core';
import { parseBody, userRoute } from '@/lib/admin-route';
import { getClientIp, tooManyRequests } from '@/lib/http';
import { blockedIpResponse } from '@/lib/ip-block';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  methodId: z.string().trim().max(30),
  amount: z.preprocess((v) => (typeof v === 'number' ? String(v) : v), z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/, 'Enter a valid amount')),
});

// Nạp qua MoMo / phương thức thủ công admin tạo
export const POST = userRoute(async (req, _ctx, user) => {
  const blocked = await blockedIpResponse(getClientIp(req));
  if (blocked) return blocked;
  const limit = await rateLimit(`deposit:create:${user.id}`, 10, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const input = await parseBody(req, schema, 'Please check the highlighted fields');
  const deposit = await createManualDeposit(user.id, input);
  return NextResponse.json({ deposit }, { status: 201 });
});
