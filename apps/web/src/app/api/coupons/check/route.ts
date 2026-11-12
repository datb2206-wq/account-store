import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@accszone/database';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { CouponError, evaluateCoupon } from '@/lib/coupons';
import { jsonError, readJson, tooManyRequests } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';

const schema = z.object({
  code: z.string().trim().min(1).max(40),
  productId: z.string().min(1).max(50),
  quantity: z.coerce.number().int().min(1).max(100_000),
});

// Xem trước số tiền được giảm (không trừ lượt dùng). Lượt dùng chỉ bị trừ khi mua thành công.
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return jsonError(401, 'Unauthorized');
  // Giới hạn để không dò được danh sách mã
  const limit = await rateLimit(`coupon:user:${user.id}`, 20, 10 * 60);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, 'Invalid coupon code');
  const { code, productId, quantity } = parsed.data;

  const product = await prisma.product.findUnique({ where: { id: productId }, select: { price: true } });
  if (!product) return jsonError(404, 'Not found');
  const subtotal = product.price.mul(quantity);
  try {
    const { coupon, discount } = await evaluateCoupon(prisma, code, productId, subtotal);
    return NextResponse.json({
      code: coupon.code,
      percent: coupon.discountPercent.toString(),
      discount: discount.toString(),
      total: subtotal.sub(discount).toString(),
    });
  } catch (err) {
    if (err instanceof CouponError) return jsonError(400, err.message);
    throw err;
  }
}
