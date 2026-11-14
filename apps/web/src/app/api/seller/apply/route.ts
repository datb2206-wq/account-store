import { NextResponse } from 'next/server';
import { z } from 'zod';
import { applySeller } from '@accszone/core';
import { parseBody, userRoute } from '@/lib/admin-route';
import { tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  shopName: z.string().trim().min(2, 'Shop name must be at least 2 characters').max(60),
  contact: z.string().trim().min(3, 'Enter a Telegram / Zalo contact').max(200),
  intro: z.string().trim().max(2000).default(''),
});

// Khách đăng ký làm CTV (người bán). Admin duyệt ở Admin > CTV.
export const POST = userRoute(async (req, _ctx, user) => {
  const limit = await rateLimit(`seller:apply:${user.id}`, 5, 60 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);
  const input = await parseBody(req, schema, 'Please check the highlighted fields');
  await applySeller(user.id, input);
  return NextResponse.json({ ok: true }, { status: 201 });
});
