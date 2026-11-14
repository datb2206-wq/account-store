// Nạp tiền: ngân hàng (mã nội dung riêng) + USDT TRC20/BEP20 (xác minh TxID on-chain).
// Mọi lần cộng tiền đều đi qua creditDeposit() -> 1 chỗ duy nhất đụng vào số dư.
import { Prisma, prisma, type PaymentMethod } from '@accszone/database';
import { domainError } from './errors';
import { ChainError, fetchUsdtTx, fromRawUnits, normalizeTxHash, sameAddress, toRawUnits, USDT_DECIMALS, type UsdtNetwork } from './chain';
import { randomCode } from './codes';
import { getConfig } from './config';
import { notifyDeposit } from './telegram';

const MAX_PENDING_PER_USER = 5;
// Yêu cầu USDT đã hết hạn vẫn được gửi TxID trong khoảng này (khách chuyển trễ)
const LATE_TXID_WINDOW_MS = 24 * 60 * 60 * 1000;
// Lệch giờ cho phép giữa block timestamp và lúc tạo yêu cầu
const CLOCK_SKEW_MS = 5 * 60 * 1000;

export const USDT_METHOD: Record<UsdtNetwork, PaymentMethod> = { TRC20: 'USDT_TRC20', BEP20: 'USDT_BEP20' };
const configKey = (n: UsdtNetwork): 'usdt.trc20' | 'usdt.bep20' => (n === 'TRC20' ? 'usdt.trc20' : 'usdt.bep20');

const isUniqueViolation = (err: unknown) => (err as { code?: string })?.code === 'P2002';

// Không có cron job -> đánh dấu hết hạn "lười" mỗi khi có người xem/tạo yêu cầu nạp.
// Yêu cầu USDT đã gắn TxID (đang chờ đủ confirmations) và yêu cầu ngân hàng khách đã báo
// "đã chuyển khoản" (chờ admin duyệt) thì không hết hạn.
export function expireStaleDeposits() {
  return prisma.transaction.updateMany({
    where: { type: 'DEPOSIT', status: 'PENDING', txHash: null, claimedAt: null, expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });
}

async function assertCanCreate(userId: string) {
  await expireStaleDeposits();
  const pending = await prisma.transaction.count({ where: { userId, type: 'DEPOSIT', status: 'PENDING' } });
  if (pending >= MAX_PENDING_PER_USER) {
    throw domainError(429, `You already have ${pending} pending deposits. Complete them or wait until they expire.`);
  }
  const { minAmountUsd, expireMinutes } = await getConfig('deposit');
  return { minAmountUsd, expiresAt: new Date(Date.now() + expireMinutes * 60_000) };
}

// ---------------------------------------------------------------- BANK
export async function createBankDeposit(userId: string, input: { accountIndex: number; amount: string }) {
  const [accounts, rates] = await Promise.all([getConfig('bank.accounts'), getConfig('currency.rates')]);
  const account = accounts[input.accountIndex];
  if (!account) throw domainError(400, 'Bank account not found');
  const rate = rates[account.currency];
  if (!rate) throw domainError(400, `Exchange rate for ${account.currency} is not configured`);

  const { minAmountUsd, expiresAt } = await assertCanCreate(userId);
  const original = new Prisma.Decimal(input.amount);
  const usd = original.div(rate).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
  if (usd.lt(minAmountUsd)) {
    const minLocal = new Prisma.Decimal(minAmountUsd).mul(rate).toDecimalPlaces(0, Prisma.Decimal.ROUND_UP);
    throw domainError(400, `Minimum deposit is $${minAmountUsd} (≈ ${minLocal.toNumber().toLocaleString('en-US')} ${account.currency})`);
  }

  // Mã nội dung chuyển khoản: "NAP" + 6 ký tự, không dấu cách (app ngân hàng hay tự bỏ dấu cách)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.transaction.create({
        data: {
          userId,
          type: 'DEPOSIT',
          method: 'BANK_TRANSFER',
          status: 'PENDING',
          amount: usd.toFixed(6),
          originalAmount: original.toFixed(6),
          originalCurrency: account.currency,
          exchangeRate: String(rate),
          transferCode: `NAP${randomCode(6)}`,
          expiresAt,
          metadata: { bank: account },
        },
        select: { id: true },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw domainError(503, 'Could not generate a transfer code, please try again');
}

// ---------------------------------------------------------------- USDT
// Khách nhập số tiền nguyên (VD 25), hệ thống cộng phần lẻ ngẫu nhiên -> 25.0037.
// Số lẻ là "dấu vân tay": TxID chỉ khớp với ĐÚNG yêu cầu có cùng số tiền, nên người khác nhìn thấy
// TxID trên blockchain cũng không nhận vơ được. Khách được cộng đúng số đã chuyển (kể cả phần lẻ).
export async function createUsdtDeposit(userId: string, input: { network: UsdtNetwork; amount: number }) {
  const cfg = await getConfig(configKey(input.network));
  if (!cfg.enabled || !cfg.wallet) throw domainError(400, `USDT ${input.network} deposits are currently unavailable`);

  const { minAmountUsd, expiresAt } = await assertCanCreate(userId);
  if (input.amount < minAmountUsd) throw domainError(400, `Minimum deposit is ${minAmountUsd} USDT`);

  const method = USDT_METHOD[input.network];
  for (let attempt = 0; attempt < 30; attempt++) {
    const unique = new Prisma.Decimal(input.amount).add(new Prisma.Decimal(1 + Math.floor(Math.random() * 9999)).div(10_000));
    const taken = await prisma.transaction.count({
      where: {
        method,
        originalAmount: unique.toFixed(6),
        OR: [{ status: 'PENDING' }, { status: 'EXPIRED', createdAt: { gt: new Date(Date.now() - LATE_TXID_WINDOW_MS) } }],
      },
    });
    if (taken) continue;
    return prisma.transaction.create({
      data: {
        userId,
        type: 'DEPOSIT',
        method,
        status: 'PENDING',
        amount: unique.toFixed(6), // 1 USDT = 1 USD
        originalAmount: unique.toFixed(6),
        originalCurrency: 'USDT',
        exchangeRate: '1',
        network: input.network,
        toAddress: cfg.wallet,
        expiresAt,
      },
      select: { id: true },
    });
  }
  throw domainError(503, 'Too many deposits with this amount right now. Please try a different amount.');
}

export type VerifyResult =
  | { status: 'completed' }
  | { status: 'confirming'; confirmations: number; required: number };

// Xác minh TxID. userId = null khi admin gọi.
export async function verifyUsdtDeposit(id: string, userId: string | null, txHashInput?: string): Promise<VerifyResult> {
  const t = await prisma.transaction.findFirst({
    where: { id, type: 'DEPOSIT', method: { in: ['USDT_TRC20', 'USDT_BEP20'] }, ...(userId && { userId }) },
  });
  if (!t || !t.network || !t.toAddress || !t.originalAmount) throw domainError(404, 'Deposit not found');
  if (t.status === 'COMPLETED') return { status: 'completed' };
  if (t.status === 'REJECTED') throw domainError(400, 'This deposit was rejected. Please contact support.');
  if (t.status === 'EXPIRED' && t.createdAt.getTime() < Date.now() - LATE_TXID_WINDOW_MS) {
    throw domainError(400, 'This deposit request is too old. Please contact support with your TxID.');
  }

  const network = t.network as UsdtNetwork;
  const txHash = txHashInput ? normalizeTxHash(network, txHashInput) : t.txHash;
  if (!txHash) throw domainError(400, txHashInput ? `Invalid ${network} TxID` : 'Please enter your TxID');
  if (t.txHash && t.txHash !== txHash) throw domainError(400, 'This deposit is already linked to a different TxID');

  const cfg = await getConfig(configKey(network));
  let chain;
  try {
    chain = await fetchUsdtTx(network, txHash, cfg.contract);
  } catch (err) {
    if (err instanceof ChainError) throw domainError(503, 'Could not reach the blockchain right now. Please try again in a minute.');
    throw err;
  }

  if (!chain.found) throw domainError(404, `Transaction not found on ${network} yet. If you just sent it, wait a minute and try again.`);
  if (!chain.success) throw domainError(400, 'This transaction failed on the blockchain');

  const toUs = chain.transfers.filter((tr) => sameAddress(network, tr.to, t.toAddress!));
  if (toUs.length === 0) throw domainError(400, `This transaction did not send USDT (${network}) to our deposit wallet`);

  const decimals = USDT_DECIMALS[network];
  const received = toUs.reduce((sum, tr) => sum + tr.amount, 0n);
  const expected = toRawUnits(t.originalAmount.toString(), decimals);
  // Sai số tiền -> KHÔNG gắn TxID vào yêu cầu (tránh kẻ gian "giữ chỗ" TxID của người khác). Admin xử lý tay.
  if (received !== expected) {
    throw domainError(
      400,
      `Amount mismatch: this transaction sent ${fromRawUnits(received, decimals)} USDT but this request expects exactly ${fromRawUnits(expected, decimals)} USDT. Please contact support with your TxID.`,
    );
  }
  if (chain.timestamp && chain.timestamp.getTime() < t.createdAt.getTime() - CLOCK_SKEW_MS) {
    throw domainError(400, 'This transaction was sent before the deposit request was created');
  }

  const fields = {
    txHash,
    confirmations: chain.confirmations,
    fromAddress: toUs[0]!.from,
    metadata: { blockTime: chain.timestamp?.toISOString() ?? null, received: fromRawUnits(received, decimals) },
  };

  try {
    if (chain.confirmations < cfg.minConfirmations) {
      // Gắn TxID ngay (giữ chỗ hợp lệ vì số tiền đã khớp), chờ đủ confirmations rồi bấm kiểm tra lại
      await prisma.transaction.updateMany({ where: { id, status: { in: ['PENDING', 'EXPIRED'] } }, data: fields });
      return { status: 'confirming', confirmations: chain.confirmations, required: cfg.minConfirmations };
    }
    await prisma.$transaction((tx) => creditDeposit(tx, id, fields));
    await notifyDeposit(id);
    return { status: 'completed' };
  } catch (err) {
    // @@unique([network, txHash]): 1 TxID chỉ được ghi nhận 1 lần trên toàn hệ thống
    if (isUniqueViolation(err)) throw domainError(409, 'This TxID has already been used for another deposit');
    throw err;
  }
}

// ---------------------------------------------------------------- CREDIT / REJECT
interface CreditFields {
  amount?: string; // USD; admin có thể sửa khi khách chuyển lệch
  reviewedById?: string;
  note?: string;
  bankRef?: string;
  txHash?: string;
  confirmations?: number;
  fromAddress?: string;
  metadata?: Prisma.InputJsonValue;
}

// Cộng tiền cho 1 yêu cầu nạp. PHẢI chạy trong prisma.$transaction.
export async function creditDeposit(db: Prisma.TransactionClient, id: string, fields: CreditFields) {
  // UPDATE có điều kiện status: 2 admin bấm duyệt cùng lúc / webhook gửi 2 lần -> chỉ 1 lần thành công
  const claimed = await db.transaction.updateMany({
    where: { id, type: 'DEPOSIT', status: { in: ['PENDING', 'EXPIRED'] } },
    data: { ...fields, status: 'COMPLETED', ...(fields.reviewedById && { reviewedAt: new Date() }) },
  });
  if (claimed.count === 0) throw domainError(409, 'This deposit has already been processed');

  const { userId, amount } = await db.transaction.findUniqueOrThrow({ where: { id }, select: { userId: true, amount: true } });
  if (amount.lte(0)) throw domainError(400, 'Deposit amount must be greater than 0');

  const [row] = await db.$queryRaw<{ balance: Prisma.Decimal }[]>`
    UPDATE users SET balance = balance + ${amount.toString()}::numeric, "updatedAt" = NOW()
    WHERE id = ${userId}
    RETURNING balance`;
  const balanceAfter = row!.balance;
  await db.transaction.update({ where: { id }, data: { balanceBefore: balanceAfter.sub(amount), balanceAfter } });
  const bonus = await creditDepositBonus(db, id, userId, amount);
  return { userId, amount, balanceAfter: bonus?.balanceAfter ?? balanceAfter, bonus: bonus?.amount ?? null };
}

// Khuyến mãi nạp tiền (Admin > Khuyến mãi nạp tiền): lấy mốc cao nhất mà số tiền nạp đạt tới,
// cộng thêm thành 1 dòng sổ cái BONUS riêng để đối soát được tiền nạp thật và tiền thưởng.
async function creditDepositBonus(db: Prisma.TransactionClient, depositId: string, userId: string, amount: Prisma.Decimal) {
  const tier = await db.depositBonus.findFirst({
    where: { isActive: true, minAmount: { lte: amount } },
    orderBy: { minAmount: 'desc' },
    select: { bonusPercent: true },
  });
  if (!tier || tier.bonusPercent.lte(0)) return null;
  const bonus = amount.mul(tier.bonusPercent).div(100).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
  if (bonus.lte(0)) return null;

  const [row] = await db.$queryRaw<{ balance: Prisma.Decimal }[]>`
    UPDATE users SET balance = balance + ${bonus.toString()}::numeric, "updatedAt" = NOW()
    WHERE id = ${userId}
    RETURNING balance`;
  const { method } = await db.transaction.findUniqueOrThrow({ where: { id: depositId }, select: { method: true } });
  await db.transaction.create({
    data: {
      userId,
      type: 'BONUS',
      method,
      status: 'COMPLETED',
      amount: bonus,
      balanceBefore: row!.balance.sub(bonus),
      balanceAfter: row!.balance,
      note: `Khuyến mãi nạp tiền +${tier.bonusPercent.toString()}% (lệnh nạp ${depositId})`,
    },
  });
  return { amount: bonus, balanceAfter: row!.balance };
}

/** Các mốc khuyến mãi đang bật, hiển thị cho khách ở trang nạp tiền */
export function activeDepositBonuses() {
  return prisma.depositBonus.findMany({ where: { isActive: true }, orderBy: { minAmount: 'asc' }, select: { minAmount: true, bonusPercent: true } });
}

export async function rejectDeposit(id: string, reviewerId: string, note: string) {
  const res = await prisma.transaction.updateMany({
    where: { id, type: 'DEPOSIT', status: { in: ['PENDING', 'EXPIRED'] } },
    data: { status: 'REJECTED', reviewedById: reviewerId, reviewedAt: new Date(), note },
  });
  if (res.count === 0) throw domainError(409, 'Yêu cầu này đã được xử lý trước đó');
}

// Khách báo đã thanh toán, phải kèm mã giao dịch HOẶC biên lai -> yêu cầu chờ admin duyệt.
// Ngân hàng: mã giao dịch ngân hàng. USDT: TxID (dùng khi tự kiểm tra on-chain không khớp, VD chuyển lệch số tiền).
// Yêu cầu vừa hết hạn vẫn báo được trong 24h (khách chuyển trễ) và được mở lại thành PENDING.
// Báo lại lần nữa khi đang chờ: chỉ thay mã giao dịch / biên lai (nếu có giá trị mới).
// Trả về khóa biên lai cũ (nếu bị thay) để nơi gọi xóa file.
export async function claimDeposit(userId: string, id: string, proofKey: string | null, customerRef: string | null) {
  const t = await prisma.transaction.findFirst({
    where: { id, userId, type: 'DEPOSIT', method: { in: ['BANK_TRANSFER', 'USDT_TRC20', 'USDT_BEP20'] } },
    select: { status: true, createdAt: true, claimedAt: true, proofImageUrl: true, customerRef: true },
  });
  if (!t) throw domainError(404, 'Deposit not found');
  if (!proofKey && !customerRef && !t.proofImageUrl && !t.customerRef) {
    throw domainError(400, 'Enter the transaction reference or upload a receipt');
  }
  const lateOk = t.status === 'EXPIRED' && t.createdAt.getTime() > Date.now() - LATE_TXID_WINDOW_MS;
  if (t.status !== 'PENDING' && !lateOk) throw domainError(409, 'This deposit has already been processed');

  const res = await prisma.transaction.updateMany({
    // điều kiện status lặp lại để không ghi đè nếu admin vừa duyệt/từ chối giữa 2 câu lệnh
    where: { id, userId, status: t.status },
    data: {
      status: 'PENDING',
      claimedAt: t.claimedAt ?? new Date(),
      ...(proofKey && { proofImageUrl: proofKey }),
      ...(customerRef && { customerRef }),
    },
  });
  if (res.count === 0) throw domainError(409, 'This deposit has already been processed');
  return { replacedProof: proofKey && t.proofImageUrl && t.proofImageUrl !== proofKey ? t.proofImageUrl : null };
}

// Admin cộng/trừ tay. Trừ không được làm số dư âm.
export async function adjustBalance(actorId: string, userId: string, amount: string, note: string) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
      UPDATE users SET balance = balance + ${amount}::numeric, "updatedAt" = NOW()
      WHERE id = ${userId} AND balance + ${amount}::numeric >= 0
      RETURNING balance`;
    if (!row) throw domainError(400, 'Số dư không đủ để trừ (hoặc người dùng không tồn tại)');
    const delta = new Prisma.Decimal(amount);
    return tx.transaction.create({
      data: {
        userId,
        type: 'ADJUSTMENT',
        method: 'MANUAL',
        status: 'COMPLETED',
        amount: delta.toFixed(6),
        balanceBefore: row.balance.sub(delta),
        balanceAfter: row.balance,
        reviewedById: actorId,
        reviewedAt: new Date(),
        note,
      },
      select: { id: true, balanceAfter: true },
    });
  });
}

// ---------------------------------------------------------------- BANK WEBHOOK
// Tìm mã NAPxxxxxx trong nội dung chuyển khoản (app ngân hàng có thể chèn dấu cách / ký tự lạ)
export function extractTransferCode(description: string) {
  const m = description.toUpperCase().match(/NAP\s*([23456789A-HJKMNP-Z]{6})/);
  return m ? `NAP${m[1]}` : null;
}
