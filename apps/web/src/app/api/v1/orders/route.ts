import { randomUUID } from 'node:crypto';
import { after, type NextRequest } from 'next/server';
import { creditCommission, creditSellerEarning, emailOrder, notifyOrder } from '@accszone/core';
import { prisma } from '@accszone/database';
import { apiFail, apiOk, authApi } from '@/lib/api-keys';
import { readJson } from '@/lib/http';
import { localized } from '@/lib/format';
import { apiLocale } from '@/lib/public-api';
import { getOrderForUser, purchase, PurchaseError } from '@/lib/purchase';
import { rateLimit } from '@/lib/rate-limit';
import { getSiteUrl } from '@/lib/site';
import { isTelegramPlaceholderEmail } from '@/lib/telegram-account';
import { IDEMPOTENCY_KEY_RE } from '@/lib/validation';

// GET /api/v1/orders?page=1&limit=20 — đơn gần nhất
export async function GET(req: NextRequest) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const sp = req.nextUrl.searchParams;
  const locale = await apiLocale(sp.get('lang'));
  const limit = Math.min(Math.max(Number(sp.get('limit')) || 20, 1), 100);
  const page = Math.max(Number(sp.get('page')) || 1, 1);
  const where = { userId: auth.user.id };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { code: true, status: true, quantity: true, unitPrice: true, totalAmount: true, createdAt: true, product: { select: { id: true, name: true } } },
    }),
  ]);
  return apiOk({
    page,
    limit,
    total,
    orders: rows.map((o) => ({
      code: o.code,
      status: o.status,
      product_id: o.product.id,
      product_name: localized(o.product.name, locale),
      quantity: o.quantity,
      unit_price: o.unitPrice.toString(),
      total: o.totalAmount.toString(),
      created_at: o.createdAt.toISOString(),
    })),
  });
}

// POST /api/v1/orders  { "product_id": "...", "quantity": 1, "coupon": "OPTIONAL" }
// Header Idempotency-Key (khuyên dùng): gửi lại cùng key khi retry -> nhận lại đúng đơn cũ, không trừ tiền 2 lần
export async function POST(req: NextRequest) {
  const auth = await authApi(req);
  if ('res' in auth) return auth.res;
  const { user } = auth;
  const limit = await rateLimit(`order:user:${user.id}`, 30, 60).catch(() => ({ ok: true as const }));
  if (!limit.ok) return apiFail(429, 'Too many orders, slow down');

  const idem = req.headers.get('idempotency-key')?.trim();
  if (idem && !IDEMPOTENCY_KEY_RE.test(idem)) return apiFail(400, 'Invalid Idempotency-Key (8–100 chars: A-Z a-z 0-9 _ -)');
  const body = (await readJson(req)) as { product_id?: unknown; productId?: unknown; quantity?: unknown; coupon?: unknown } | null;
  const productId = String(body?.product_id ?? body?.productId ?? '').trim();
  const quantity = Number(body?.quantity ?? 1);
  if (!productId || productId.length > 100) return apiFail(400, 'product_id is required');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100_000) return apiFail(400, 'quantity must be an integer ≥ 1');
  const coupon = typeof body?.coupon === 'string' && body.coupon.trim() ? body.coupon.trim().slice(0, 40).toUpperCase() : undefined;

  try {
    const result = await purchase({ userId: user.id, productId, quantity, idempotencyKey: idem ?? `api-${randomUUID()}`, couponCode: coupon });
    if (!result.replayed) {
      const ref = { code: result.order.code };
      after(() =>
        Promise.all([
          notifyOrder(ref, 'API'),
          creditCommission(ref),
          creditSellerEarning(ref),
          isTelegramPlaceholderEmail(user.email) ? null : getSiteUrl().then((u) => emailOrder(ref, u)),
        ]),
      );
    }
    const fresh = await getOrderForUser(result.order.code, user.id, await apiLocale(req.nextUrl.searchParams.get('lang')));
    const { balance } = await prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { balance: true } });
    return apiOk({ ...(fresh ?? result), balance: balance.toString(), replayed: result.replayed }, result.replayed ? 200 : 201);
  } catch (err) {
    if (err instanceof PurchaseError) return apiFail(err.status, err.message);
    throw err;
  }
}
