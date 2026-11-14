import { NextResponse } from 'next/server';
import { z } from 'zod';
import { submitCard } from '@accszone/core';
import { parseBody, userRoute } from '@/lib/admin-route';
import { getClientIp, tooManyRequests } from '@/lib/http';
import { blockedIpResponse } from '@/lib/ip-block';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  telco: z.string().trim().toUpperCase().max(20),
  amount: z.coerce.number().int().positive(),
  serial: z.string().trim().regex(/^[0-9A-Za-z\s-]{6,30}$/, 'Enter a valid serial number'),
  code: z.string().trim().regex(/^[0-9A-Za-z\s-]{6,30}$/, 'Enter a valid card code'),
});

// Gửi thẻ cào: chuyển sang đối tác đổi thẻ, kết quả về ngay hoặc qua callback
export const POST = userRoute(async (req, _ctx, user) => {
  const blocked = await blockedIpResponse(getClientIp(req));
  if (blocked) return blocked;
  const limit = await rateLimit(`deposit:card:${user.id}`, 10, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const input = await parseBody(req, schema, 'Please check the highlighted fields');
  const result = await submitCard(user.id, input);
  return NextResponse.json({ deposit: result }, { status: 201 });
});
