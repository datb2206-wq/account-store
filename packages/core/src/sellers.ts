// CTV (cộng tác viên bán hàng): người bán ngoài đăng sản phẩm + nhập kho, web giữ phí sàn.
//  - Đơn COMPLETED -> creditSellerEarning(): tạo khoản HOLD = tiền thực thu × (100 − phí sàn)%.
//  - Hết thời gian giữ (holdHours, "Cộng tiền người bán") -> releaseSellerEarnings(): HOLD -> AVAILABLE, cộng vào Seller.balance.
//  - Hoàn tiền (1 phần / toàn bộ) -> syncSellerEarning(): tính lại khoản tiền; đã vào số dư thì trừ phần chênh (số dư có thể âm).
//  - Rút: "balance" chuyển ngay vào số dư mua hàng; "bank" chờ admin chuyển khoản, từ chối thì trả lại.
// Mọi thay đổi số dư là UPDATE có điều kiện trong transaction: chạy lặp / song song không cộng trùng.
import { Prisma, prisma } from '@accszone/database';
import { CONFIG_SCHEMAS, type ConfigValue } from './config';
import { domainError } from './errors';

export type CtvSettings = ConfigValue<'ctv'>;

export const CTV_DEFAULTS: CtvSettings = {
  enabled: false,
  allowApply: true,
  commissionPercent: 10,
  holdHours: 72,
  autoApproveProducts: false,
  minWithdraw: 10,
  allowBalance: true,
  allowBank: true,
};

export async function getCtvSettings(): Promise<CtvSettings> {
  const row = await prisma.systemConfig.findUnique({ where: { key: 'ctv' } });
  const parsed = CONFIG_SCHEMAS.ctv.safeParse(row?.value);
  return parsed.success ? parsed.data : CTV_DEFAULTS;
}

const D = (v: Prisma.Decimal.Value) => new Prisma.Decimal(v);

// ---------------------------------------------------------------- Đăng ký / duyệt CTV
export async function applySeller(userId: string, input: { shopName: string; contact: string; intro: string }) {
  const s = await getCtvSettings();
  if (!s.enabled || !s.allowApply) throw domainError(400, 'Seller registration is not open');
  const existing = await prisma.seller.findUnique({ where: { userId }, select: { status: true } });
  const data = { shopName: input.shopName.trim().slice(0, 60), contact: input.contact.trim().slice(0, 200), intro: input.intro.trim().slice(0, 2000) };
  if (!existing) return prisma.seller.create({ data: { userId, ...data } });
  // Bị từ chối thì được đăng ký lại; đang chờ thì cập nhật thông tin
  if (existing.status === 'REJECTED' || existing.status === 'PENDING') return prisma.seller.update({ where: { userId }, data: { ...data, status: 'PENDING' } });
  throw domainError(409, 'You are already a seller');
}

// Đổi trạng thái CTV. Khóa / từ chối -> ẩn toàn bộ sản phẩm của CTV đó.
export async function setSellerStatus(id: string, status: 'ACTIVE' | 'SUSPENDED' | 'REJECTED', note?: string) {
  return prisma.$transaction(async (tx) => {
    const seller = await tx.seller.update({
      where: { id },
      data: { status, ...(status === 'ACTIVE' && { approvedAt: new Date() }), ...(note !== undefined && { adminNote: note.slice(0, 1000) }) },
    });
    if (status !== 'ACTIVE') await tx.product.updateMany({ where: { sellerId: id }, data: { isActive: false } });
    return seller;
  });
}

export function sellerFee(seller: { commissionPercent: Prisma.Decimal | null }, s: CtvSettings) {
  return seller.commissionPercent ?? D(s.commissionPercent);
}

// ---------------------------------------------------------------- Tiền bán hàng
async function paidOf(tx: Prisma.TransactionClient, orderId: string, total: Prisma.Decimal) {
  const { _sum } = await tx.transaction.aggregate({ where: { orderId, type: 'REFUND', status: 'COMPLETED' }, _sum: { amount: true } });
  return total.sub(_sum.amount ?? 0);
}

// Gọi khi đơn đã COMPLETED. Chạy lại nhiều lần vẫn chỉ tạo 1 khoản (orderId unique).
export async function creditSellerEarning(ref: { id: string } | { code: string }) {
  try {
    const order = await prisma.order.findUnique({
      where: ref,
      select: { id: true, status: true, totalAmount: true, product: { select: { seller: { select: { id: true, commissionPercent: true } } } } },
    });
    const seller = order?.product.seller;
    if (!order || order.status !== 'COMPLETED' || !seller) return;
    const s = await getCtvSettings();
    const fee = sellerFee(seller, s);
    await prisma.$transaction(async (tx) => {
      const paid = await paidOf(tx, order.id, order.totalAmount);
      const amount = paid.mul(D(100).sub(fee)).div(100).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
      const instant = s.holdHours === 0;
      await tx.sellerEarning.create({
        data: {
          sellerId: seller.id,
          orderId: order.id,
          orderAmount: paid,
          feePercent: fee,
          amount,
          status: instant ? 'AVAILABLE' : 'HOLD',
          releaseAt: new Date(Date.now() + s.holdHours * 3_600_000),
        },
      });
      if (instant && amount.gt(0)) await tx.seller.update({ where: { id: seller.id }, data: { balance: { increment: amount } } });
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') console.warn(`[ctv] credit failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Gọi sau mỗi lần hoàn tiền đơn (1 phần hoặc toàn bộ): tính lại khoản tiền của CTV
export async function syncSellerEarning(orderId: string) {
  try {
    await prisma.$transaction(async (tx) => {
      const e = await tx.sellerEarning.findUnique({ where: { orderId } });
      if (!e || e.status === 'REVERSED') return;
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, totalAmount: true } });
      const paid = order.status === 'REFUNDED' ? D(0) : await paidOf(tx, orderId, order.totalAmount);
      const amount = paid.mul(D(100).sub(e.feePercent)).div(100).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
      if (amount.eq(e.amount) && order.status !== 'REFUNDED') return;
      const status = order.status === 'REFUNDED' || amount.lte(0) ? 'REVERSED' : e.status;
      // Điều kiện amount + status cũ: 2 lần sync song song chỉ 1 lần áp dụng chênh lệch
      const claimed = await tx.sellerEarning.updateMany({ where: { id: e.id, status: e.status, amount: e.amount }, data: { amount: amount.lt(0) ? 0 : amount, orderAmount: paid, status } });
      if (!claimed.count) return;
      if (e.status === 'AVAILABLE') {
        const delta = (amount.lt(0) ? D(0) : amount).sub(e.amount);
        if (!delta.isZero()) await tx.seller.update({ where: { id: e.sellerId }, data: { balance: { increment: delta } } });
      }
    });
  } catch (err) {
    console.warn(`[ctv] sync failed: ${err instanceof Error ? err.message : err}`);
  }
}

// Lưới an toàn: đơn hàng CTV đã hoàn tất mà chưa có khoản tiền (VD server tắt ngay sau khi bán) -> tạo bù
export async function backfillSellerEarnings() {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT o.id FROM orders o
    JOIN products p ON p.id = o."productId"
    LEFT JOIN seller_earnings e ON e."orderId" = o.id
    WHERE p."sellerId" IS NOT NULL AND o.status = 'COMPLETED' AND e.id IS NULL
      AND o."createdAt" > now() - interval '7 days' AND o."updatedAt" < now() - interval '2 minutes'
    LIMIT 200`;
  for (const r of rows) await creditSellerEarning({ id: r.id });
  return rows.length;
}

// Chuyển các khoản HOLD đã hết thời gian giữ vào số dư CTV. Gọi từ worker + khi mở trang CTV.
export async function releaseSellerEarnings(sellerId?: string) {
  const due = await prisma.sellerEarning.findMany({
    where: { status: 'HOLD', releaseAt: { lte: new Date() }, ...(sellerId && { sellerId }) },
    select: { id: true, sellerId: true, amount: true },
    take: 500,
  });
  let released = 0;
  for (const e of due) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.sellerEarning.updateMany({ where: { id: e.id, status: 'HOLD' }, data: { status: 'AVAILABLE' } });
      if (!claimed.count) return;
      await tx.seller.update({ where: { id: e.sellerId }, data: { balance: { increment: e.amount } } });
      released++;
    });
  }
  return released;
}

// ---------------------------------------------------------------- Rút tiền
export interface SellerWithdrawInput {
  amount: string;
  method: 'balance' | 'bank';
  bankName?: string;
  accountNo?: string;
  accountName?: string;
}

export async function requestSellerWithdrawal(userId: string, input: SellerWithdrawInput) {
  const s = await getCtvSettings();
  const seller = await prisma.seller.findUnique({ where: { userId }, select: { id: true, status: true } });
  if (!s.enabled || !seller || seller.status !== 'ACTIVE') throw domainError(403, 'Your seller account is not active');
  if ((input.method === 'balance' && !s.allowBalance) || (input.method === 'bank' && !s.allowBank)) throw domainError(400, 'This withdrawal method is not available');
  const amount = D(input.amount);
  if (amount.lte(0)) throw domainError(400, 'Enter a valid amount');
  if (amount.lt(s.minWithdraw)) throw domainError(400, `Minimum withdrawal is $${s.minWithdraw}`);
  if (input.method === 'bank' && (!input.bankName?.trim() || !input.accountNo?.trim() || !input.accountName?.trim())) throw domainError(400, 'Enter your bank details');

  return prisma.$transaction(async (tx) => {
    const taken = await tx.$executeRaw`
      UPDATE sellers SET balance = balance - ${amount.toString()}::numeric, "updatedAt" = NOW()
      WHERE id = ${seller.id} AND balance >= ${amount.toString()}::numeric`;
    if (!taken) throw domainError(400, 'Insufficient seller balance');
    if (input.method === 'balance') {
      const [row] = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
        UPDATE users SET balance = balance + ${amount.toString()}::numeric, "updatedAt" = NOW()
        WHERE id = ${userId} RETURNING balance`;
      await tx.transaction.create({
        data: { userId, type: 'SELLER', method: 'BALANCE', status: 'COMPLETED', amount, balanceBefore: row!.balance.sub(amount), balanceAfter: row!.balance, note: 'Chuyển tiền bán hàng (CTV) vào số dư' },
      });
      return tx.sellerWithdrawal.create({ data: { sellerId: seller.id, amount, method: 'balance', status: 'COMPLETED' } });
    }
    return tx.sellerWithdrawal.create({
      data: { sellerId: seller.id, amount, method: 'bank', bankName: input.bankName!.trim().slice(0, 100), accountNo: input.accountNo!.trim().slice(0, 50), accountName: input.accountName!.trim().slice(0, 100) },
    });
  });
}

export async function reviewSellerWithdrawal(id: string, reviewerId: string, approve: boolean, note: string) {
  return prisma.$transaction(async (tx) => {
    const w = await tx.sellerWithdrawal.findUnique({ where: { id }, select: { sellerId: true, amount: true } });
    if (!w) throw domainError(404, 'Không tìm thấy lệnh rút');
    const claimed = await tx.sellerWithdrawal.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: approve ? 'COMPLETED' : 'REJECTED', note: note.slice(0, 500), reviewedById: reviewerId, reviewedAt: new Date() },
    });
    if (!claimed.count) throw domainError(409, 'Lệnh rút này đã được xử lý');
    if (!approve) await tx.seller.update({ where: { id: w.sellerId }, data: { balance: { increment: w.amount } } });
    return w;
  });
}
