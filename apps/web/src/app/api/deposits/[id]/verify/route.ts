import { NextResponse } from 'next/server';
import { parseBody, userRoute } from '@/lib/admin-route';
import { verifyUsdtDeposit } from '@accszone/core';
import { tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
import { verifyDepositSchema } from '@/lib/validation';

type Ctx = { params: Promise<{ id: string }> };

// Khách gửi TxID (lần đầu) hoặc bấm "Check again" (không cần gửi lại TxID)
export const POST = userRoute<Ctx>(async (req, { params }, user) => {
  // Mỗi lần verify gọi API blockchain bên ngoài -> giới hạn chặt
  const limit = await rateLimit(`deposit:verify:${user.id}`, 20, 10 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const { id } = await params;
  const { txHash } = await parseBody(req, verifyDepositSchema, 'Invalid TxID');
  return NextResponse.json(await verifyUsdtDeposit(id, user.id, txHash || undefined));
});
