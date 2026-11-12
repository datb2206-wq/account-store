import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@accszone/database';
import { getCurrentUser } from '@/lib/auth';
import { getClientIp, isSameOrigin, jsonError, readJson, tooManyRequests } from '@/lib/http';
import { blockedIpResponse } from '@/lib/ip-block';
import { purchase, PurchaseError } from '@/lib/purchase';
import { rateLimit } from '@/lib/rate-limit';
import { blockedByMaintenance, MAINTENANCE_ERROR } from '@/lib/site';
import { fieldErrors, IDEMPOTENCY_KEY_RE, orderSchema } from '@/lib/validation';

// Mua hàng. Header bắt buộc: Idempotency-Key (gửi lại đúng key khi retry -> nhận lại đúng đơn cũ)
export async function POST(req: NextRequest) {
  if (!isSameOrigin(req)) return jsonError(403, 'Invalid origin');
  const blocked = await blockedIpResponse(getClientIp(req));
  if (blocked) return blocked;
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');
  if (await blockedByMaintenance(user)) return jsonError(503, MAINTENANCE_ERROR);

  const idempotencyKey = req.headers.get('idempotency-key') ?? '';
  if (!IDEMPOTENCY_KEY_RE.test(idempotencyKey)) {
    return jsonError(400, 'Missing or invalid Idempotency-Key header (8–100 chars: A-Z a-z 0-9 _ -)');
  }

  const limit = await rateLimit(`order:user:${user.id}`, 30, 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const parsed = orderSchema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, 'Invalid order', { fields: fieldErrors(parsed.error) });

  try {
    const result = await purchase({ userId: user.id, idempotencyKey, ...parsed.data });
    const { balance } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } });
    return NextResponse.json(
      { ...result, balance: balance.toString() },
      {
        status: result.replayed ? 200 : 201,
        headers: { 'Cache-Control': 'no-store', ...(result.replayed && { 'Idempotent-Replayed': 'true' }) },
      },
    );
  } catch (err) {
    if (err instanceof PurchaseError) return jsonError(err.status, err.message);
    throw err;
  }
}
