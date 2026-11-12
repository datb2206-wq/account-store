// Mã giảm giá (Admin > Mã giảm giá). Chỉ dùng phía server.
import { Prisma, prisma } from '@accszone/database';

export class CouponError extends Error {}

export const normalizeCode = (code: string) => code.trim().toUpperCase();

type Db = Prisma.TransactionClient | typeof prisma;

// Kiểm tra mã và tính số tiền được giảm cho 1 đơn (chưa trừ lượt dùng).
// Thông báo lỗi là câu tiếng Anh cố định -> i18n/errors.ts dịch sang ngôn ngữ của khách.
export async function evaluateCoupon(db: Db, rawCode: string, productId: string, total: Prisma.Decimal) {
  const coupon = await db.coupon.findUnique({ where: { code: normalizeCode(rawCode) } });
  if (!coupon || !coupon.isActive) throw new CouponError('Invalid coupon code');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new CouponError('This coupon has expired');
  if (coupon.usedCount >= coupon.maxUses) throw new CouponError('This coupon has been fully used');
  if (coupon.productIds.length > 0 && !coupon.productIds.includes(productId)) throw new CouponError('This coupon does not apply to this product');
  if (coupon.minOrder && total.lt(coupon.minOrder)) throw new CouponError(`Minimum order for this coupon is $${coupon.minOrder.toFixed(2)}`);

  let discount = total.mul(coupon.discountPercent).div(100);
  if (coupon.maxDiscount && discount.gt(coupon.maxDiscount)) discount = coupon.maxDiscount;
  discount = Prisma.Decimal.min(discount, total).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
  return { coupon, discount };
}

// Dùng 1 lượt: UPDATE có điều kiện nên nhiều người dùng cùng lúc không vượt quá maxUses.
// Chạy trong transaction mua hàng -> mua lỗi thì lượt dùng cũng được trả lại.
export async function consumeCoupon(tx: Prisma.TransactionClient, couponId: string) {
  const n = await tx.$executeRaw`
    UPDATE coupons SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
    WHERE id = ${couponId} AND "usedCount" < "maxUses" AND "isActive" = true`;
  if (n === 0) throw new CouponError('This coupon has been fully used');
}
