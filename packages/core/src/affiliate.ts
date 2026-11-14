// Affiliate (hoa hồng giới thiệu). Hoa hồng nằm ở users.commissionBalance, tách khỏi số dư mua hàng.
//  - Người được giới thiệu mua hàng thành công -> creditCommission(): + % tiền đơn thực trả cho người giới thiệu.
//  - Đơn bị hoàn toàn bộ -> reverseCommission(): trừ lại đúng số đã cộng (số dư hoa hồng có thể âm, trừ dần vào lần sau).
//  - Rút: "balance" chuyển vào số dư ngay; "bank" chờ admin duyệt và chuyển khoản tay, từ chối thì trả lại hoa hồng.
// Mọi thay đổi số dư là UPDATE có điều kiện trong transaction: chạy lặp / song song không cộng trùng.
import { Prisma, prisma } from '@accszone/database';
import { randomCode } from './codes';
import { getConfig, type ConfigValue } from './config';
import { domainError } from './errors';

export type AffiliateSettings = ConfigValue<'affiliate'>;

export const AFFILIATE_DEFAULTS: AffiliateSettings = {
  enabled: false,
  percent: 5,
  minWithdraw: 10,
  allowBalance: true,
  allowBank: true,
  cookieDays: 30,
};

export const REF_COOKIE = 'az_ref';

export async function getAffiliateSettings(): Promise<AffiliateSettings> {
  try {
    return await getConfig('affiliate');
  } catch {
    return AFFILIATE_DEFAULTS;
  }
}

// Mã giới thiệu của user, tạo khi cần lần đầu (8 ký tự, bỏ ký tự dễ nhầm)
export async function ensureReferralCode(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let i = 0; i < 5; i++) {
    const code = randomCode(8);
    const res = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } }).catch(() => null);
    if (res?.count) return code;
    const again = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (again?.referralCode) return again.referralCode; // request khác vừa tạo
  }
  throw new Error('Không tạo được mã giới thiệu');
}

// Gắn người giới thiệu cho tài khoản mới đăng ký (bỏ qua nếu mã sai / tự giới thiệu chính mình)
export async function attachReferrer(newUserId: string, code: string | undefined | null) {
  if (!code || !/^[A-Z0-9]{4,16}$/.test(code)) return;
  const s = await getAffiliateSettings();
  if (!s.enabled) return;
  const referrer = await prisma.user.findUnique({ where: { referralCode: code }, select: { id: true, status: true } });
  if (!referrer || referrer.id === newUserId || referrer.status === 'BANNED') return;
  await prisma.user.updateMany({ where: { id: newUserId, referredById: null }, data: { referredById: referrer.id } });
}

// Gọi khi đơn đã COMPLETED (mua từ kho riêng, hoặc web gốc đã giao). Chạy lại nhiều lần vẫn chỉ cộng 1 lần.
export async function creditCommission(ref: { id: string } | { code: string }) {
  try {
    const s = await getAffiliateSettings();
    if (!s.enabled || s.percent <= 0) return;
    const order = await prisma.order.findUnique({
      where: ref,
      select: { id: true, status: true, totalAmount: true, userId: true, user: { select: { referredById: true } } },
    });
    const referrerId = order?.user.referredById;
    if (!order || order.status !== 'COMPLETED' || !referrerId) return;

    await prisma.$transaction(async (tx) => {
      // Tiền thực trả = tổng đơn - phần đã hoàn (VD giao thiếu hàng)
      const { _sum } = await tx.transaction.aggregate({ where: { orderId: order.id, type: 'REFUND', status: 'COMPLETED' }, _sum: { amount: true } });
      const paid = order.totalAmount.sub(_sum.amount ?? 0);
      const amount = paid.mul(s.percent).div(100).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
      if (amount.lte(0)) return;
      await tx.affiliateCommission.create({
        data: { referrerId, buyerId: order.userId, orderId: order.id, orderAmount: paid, percent: s.percent, amount },
      });
      await tx.user.update({ where: { id: referrerId }, data: { commissionBalance: { increment: amount } } });
    });
  } catch (err) {
    // P2002 (orderId đã có hoa hồng) = đã cộng trước đó -> bỏ qua
    if ((err as { code?: string })?.code !== 'P2002') console.warn(`[affiliate] credit failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Gọi khi đơn bị hoàn tiền toàn bộ
export async function reverseCommission(orderId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const c = await tx.affiliateCommission.findUnique({ where: { orderId }, select: { id: true, referrerId: true, amount: true } });
      if (!c) return;
      const claimed = await tx.affiliateCommission.updateMany({ where: { id: c.id, status: 'CREDITED' }, data: { status: 'REVERSED' } });
      if (!claimed.count) return;
      await tx.user.update({ where: { id: c.referrerId }, data: { commissionBalance: { decrement: c.amount } } });
    });
  } catch (err) {
    console.warn(`[affiliate] reverse failed: ${err instanceof Error ? err.message : err}`);
  }
}

export interface WithdrawInput {
  amount: string;
  method: 'balance' | 'bank';
  bankName?: string;
  accountNo?: string;
  accountName?: string;
}

// Trừ hoa hồng bằng UPDATE có điều kiện: không đủ -> 0 dòng bị sửa -> báo lỗi (2 lệnh rút song song không rút quá số dư)
export async function requestWithdrawal(userId: string, input: WithdrawInput) {
  const s = await getAffiliateSettings();
  if (!s.enabled) throw domainError(400, 'The affiliate program is not available');
  if (input.method === 'balance' && !s.allowBalance) throw domainError(400, 'This withdrawal method is not available');
  if (input.method === 'bank' && !s.allowBank) throw domainError(400, 'This withdrawal method is not available');
  const amount = new Prisma.Decimal(input.amount);
  if (amount.lte(0)) throw domainError(400, 'Enter a valid amount');
  if (amount.lt(s.minWithdraw)) throw domainError(400, `Minimum withdrawal is $${s.minWithdraw}`);
  if (input.method === 'bank' && (!input.bankName?.trim() || !input.accountNo?.trim() || !input.accountName?.trim())) {
    throw domainError(400, 'Enter your bank details');
  }

  return prisma.$transaction(async (tx) => {
    const taken = await tx.$executeRaw`
      UPDATE users SET "commissionBalance" = "commissionBalance" - ${amount.toString()}::numeric, "updatedAt" = NOW()
      WHERE id = ${userId} AND "commissionBalance" >= ${amount.toString()}::numeric`;
    if (!taken) throw domainError(400, 'Insufficient commission balance');

    if (input.method === 'balance') {
      const [row] = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
        UPDATE users SET balance = balance + ${amount.toString()}::numeric, "updatedAt" = NOW()
        WHERE id = ${userId} RETURNING balance`;
      await tx.transaction.create({
        data: { userId, type: 'COMMISSION', method: 'BALANCE', status: 'COMPLETED', amount, balanceBefore: row!.balance.sub(amount), balanceAfter: row!.balance, note: 'Chuyển hoa hồng giới thiệu vào số dư' },
      });
      return tx.affiliateWithdrawal.create({ data: { userId, amount, method: 'balance', status: 'COMPLETED' } });
    }
    return tx.affiliateWithdrawal.create({
      data: { userId, amount, method: 'bank', bankName: input.bankName!.trim().slice(0, 100), accountNo: input.accountNo!.trim().slice(0, 50), accountName: input.accountName!.trim().slice(0, 100) },
    });
  });
}

// Admin duyệt (đã chuyển khoản) hoặc từ chối (trả lại hoa hồng) 1 lệnh rút về ngân hàng
export async function reviewWithdrawal(id: string, reviewerId: string, approve: boolean, note: string) {
  return prisma.$transaction(async (tx) => {
    const w = await tx.affiliateWithdrawal.findUnique({ where: { id }, select: { userId: true, amount: true } });
    if (!w) throw domainError(404, 'Không tìm thấy lệnh rút');
    const claimed = await tx.affiliateWithdrawal.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: approve ? 'COMPLETED' : 'REJECTED', note: note.slice(0, 500), reviewedById: reviewerId, reviewedAt: new Date() },
    });
    if (!claimed.count) throw domainError(409, 'Lệnh rút này đã được xử lý');
    if (!approve) await tx.user.update({ where: { id: w.userId }, data: { commissionBalance: { increment: w.amount } } });
    return w;
  });
}
