// Giao đơn RESELLER: đặt hàng sang web gốc -> giao tài khoản, hoặc hoàn tiền.
// An toàn khi chạy lặp/đồng thời: mọi thay đổi trạng thái đều là UPDATE ... WHERE status = 'PENDING',
// nên "giao hàng" và "hoàn tiền" không bao giờ cùng xảy ra cho 1 đơn, và không hoàn tiền 2 lần.
import { Prisma, prisma } from '@accszone/database';
import { contentHash, decrypt, encrypt } from '../crypto';
import { domainError } from '../errors';
import { pickRandomStock } from '../stock';
import { getAdapter } from './adapters';
import { SupplierTransientError, type SupplierOrderResult } from './generic-adapter';

export const RESELLER_TIMEOUT_MS = 24 * 60 * 60 * 1000;

const CUSTOMER_REFUND_MESSAGE = 'The supplier could not fulfil this order. Your payment has been refunded to your balance.';

export type FulfillOutcome = 'delivered' | 'partial' | 'pending' | 'refunded' | 'skipped';

interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

const audit = (action: string, orderId: string, after: Record<string, unknown>) =>
  prisma.auditLog.create({ data: { actorId: null, action, entity: 'Order', entityId: orderId, after: after as Prisma.InputJsonValue } });

// Cộng tiền hoàn lại + ghi sổ cái REFUND. PHẢI chạy trong transaction.
async function creditRefund(tx: Prisma.TransactionClient, userId: string, orderId: string, amount: Prisma.Decimal, note: string) {
  const [row] = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
    UPDATE users SET balance = balance + ${amount.toString()}::numeric, "updatedAt" = NOW()
    WHERE id = ${userId}
    RETURNING balance`;
  await tx.transaction.create({
    data: {
      userId,
      type: 'REFUND',
      method: 'BALANCE',
      status: 'COMPLETED',
      amount: amount.toFixed(6),
      balanceBefore: row!.balance.sub(amount),
      balanceAfter: row!.balance,
      orderId,
      note,
    },
  });
}

// Hoàn toàn bộ tiền 1 đơn PENDING. Trả false nếu đơn đã được xử lý trước đó.
export async function refundOrder(orderId: string, internalReason: string, externalOrderId?: string | null) {
  const refunded = await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: { status: 'REFUNDED', failReason: CUSTOMER_REFUND_MESSAGE, ...(externalOrderId && { externalOrderId }) },
    });
    if (claimed.count === 0) return false;
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { userId: true, totalAmount: true } });
    await creditRefund(tx, order.userId, orderId, order.totalAmount, `Auto refund: ${internalReason}`.slice(0, 500));
    return true;
  });
  if (refunded) await audit('order.refund', orderId, { reason: internalReason });
  return refunded;
}

// Giao hàng cho đơn PENDING (từ web gốc, hoặc admin dán tay). Thiếu hàng -> hoàn phần thiếu.
export async function deliverOrder(orderId: string, externalOrderId: string | null, rawItems: string[], actorId: string | null = null) {
  return deliver(orderId, externalOrderId, rawItems, actorId);
}

async function deliver(orderId: string, externalOrderId: string | null, rawItems: string[], actorId: string | null = null): Promise<FulfillOutcome> {
  const outcome = await prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { userId: true, productId: true, quantity: true, unitPrice: true, code: true },
    });
    const items = rawItems.slice(0, order.quantity);
    const missing = order.quantity - items.length;
    const refundAmount = order.unitPrice.mul(missing);

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: 'PENDING' },
      data: {
        status: 'COMPLETED',
        ...(externalOrderId && { externalOrderId }),
        failReason: missing > 0 ? `Partially delivered: ${items.length}/${order.quantity}. ${refundAmount.toFixed(2)} USD refunded to your balance.` : null,
      },
    });
    if (claimed.count === 0) return 'skipped' as const;

    const now = new Date();
    await tx.stockItem.createMany({
      data: items.map((line, i) => ({
        productId: order.productId,
        content: encrypt(line),
        // Gắn orderId + vị trí vào hash: hàng web gốc giao không đi qua kho mình,
        // tránh đụng unique(productId, contentHash) nếu web gốc giao lại 1 tài khoản đã giao trước đó
        contentHash: contentHash(`${orderId}:${i}:${line}`),
        status: 'SOLD',
        orderId,
        soldAt: now,
        importBatch: `RS-${order.code}`,
      })),
    });

    if (missing > 0) await creditRefund(tx, order.userId, orderId, refundAmount, `Partial delivery ${items.length}/${order.quantity}`);
    return missing > 0 ? ('partial' as const) : ('delivered' as const);
  });

  if (outcome !== 'skipped') {
    await prisma.auditLog.create({
      data: {
        actorId,
        action: actorId ? 'order.deliver.manual' : 'order.deliver',
        entity: 'Order',
        entityId: orderId,
        after: { externalOrderId, received: rawItems.length, outcome },
      },
    });
  }
  return outcome;
}

// ---------------------------------------------------------------- Thao tác thủ công của admin

// Khóa dòng order trong transaction: 2 admin bấm cùng lúc sẽ xếp hàng, không xử lý trùng
async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  const [row] = await tx.$queryRaw<{ id: string; status: string; userId: string; productId: string; totalAmount: Prisma.Decimal }[]>`
    SELECT id, status::text AS status, "userId", "productId", "totalAmount" FROM orders WHERE id = ${orderId} FOR UPDATE`;
  if (!row) throw domainError(404, 'Không tìm thấy đơn hàng');
  return row;
}

// Hoàn tiền thủ công. amount bỏ trống = hoàn toàn bộ phần còn lại.
// Tổng tiền hoàn của 1 đơn không bao giờ vượt quá số tiền khách đã trả.
export async function manualRefundOrder(input: { orderId: string; amount?: string; actorId: string; reason: string }) {
  const result = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status === 'REFUNDED' || order.status === 'FAILED') throw domainError(409, 'Đơn này đã được hoàn tiền');

    const { _sum } = await tx.transaction.aggregate({ where: { orderId: order.id, type: 'REFUND', status: 'COMPLETED' }, _sum: { amount: true } });
    const remaining = order.totalAmount.sub(_sum.amount ?? 0);
    const amount = input.amount ? new Prisma.Decimal(input.amount) : remaining;
    if (amount.lte(0) || amount.gt(remaining)) throw domainError(400, `Số tiền hoàn không hợp lệ. Tối đa còn có thể hoàn: ${remaining.toFixed(6)} USD`);
    // Đơn PENDING chỉ được hoàn toàn bộ (rồi đóng đơn) để worker không giao hàng sau đó
    if (order.status === 'PENDING' && !amount.eq(remaining)) throw domainError(400, 'Đơn đang xử lý chỉ có thể hoàn toàn bộ');

    await creditRefund(tx, order.userId, order.id, amount, `Manual refund: ${input.reason}`.slice(0, 500));
    const full = amount.eq(remaining);
    const totalRefunded = order.totalAmount.sub(remaining).add(amount);
    await tx.order.update({
      where: { id: order.id },
      data: {
        ...(full && { status: 'REFUNDED' }),
        failReason: `${totalRefunded.toFixed(2)} USD has been refunded to your balance.`,
      },
    });
    return { amount, full, previousStatus: order.status };
  });

  await prisma.auditLog.create({
    data: {
      actorId: input.actorId,
      action: 'order.refund.manual',
      entity: 'Order',
      entityId: input.orderId,
      after: { amount: result.amount.toFixed(6), full: result.full, reason: input.reason, previousStatus: result.previousStatus },
    },
  });
  return result;
}

// Đổi hàng bảo hành (đơn hàng kho LOCAL đã giao): tài khoản lỗi -> INVALID (vẫn gắn với đơn để tra cứu),
// lấy tài khoản mới từ kho giống lúc mua.
export async function replaceOrderItems(input: { orderId: string; itemIds: string[]; actorId: string; reason: string }) {
  const replaced = await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, input.orderId);
    if (order.status !== 'COMPLETED') throw domainError(400, 'Chỉ đổi hàng cho đơn đã giao (COMPLETED)');
    const product = await tx.product.findUniqueOrThrow({ where: { id: order.productId }, select: { source: true } });
    if (product.source !== 'LOCAL') throw domainError(400, 'Hàng từ nhà cung cấp không đổi được từ kho — hãy hoàn tiền');

    const old = await tx.stockItem.findMany({ where: { id: { in: input.itemIds }, orderId: order.id, status: 'SOLD' }, select: { id: true } });
    if (old.length !== input.itemIds.length) throw domainError(400, 'Có tài khoản không thuộc đơn này hoặc đã được đổi trước đó');

    const fresh = await pickRandomStock(tx, order.productId, old.length);
    if (fresh.length < old.length) throw domainError(409, `Kho chỉ còn ${fresh.length} tài khoản, cần ${old.length}`);

    await tx.stockItem.updateMany({ where: { id: { in: old.map((i) => i.id) } }, data: { status: 'INVALID' } });
    await tx.stockItem.updateMany({ where: { id: { in: fresh.map((i) => i.id) } }, data: { status: 'SOLD', orderId: order.id, soldAt: new Date() } });
    return { oldIds: old.map((i) => i.id), newIds: fresh.map((i) => i.id) };
  });

  await prisma.auditLog.create({
    data: { actorId: input.actorId, action: 'order.replace', entity: 'Order', entityId: input.orderId, after: { ...replaced, reason: input.reason } },
  });
  return replaced;
}

export async function fulfillResellerOrder(orderId: string, opts: { isLastAttempt: boolean }, log: Logger): Promise<FulfillOutcome> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      quantity: true,
      externalOrderId: true,
      createdAt: true,
      product: { select: { externalId: true } },
      supplier: { select: { baseUrl: true, apiKeyEnc: true, isActive: true, adapter: true } },
    },
  });
  if (!order || order.status !== 'PENDING') return 'skipped';
  if (!order.supplier || !order.product.externalId) {
    await refundOrder(orderId, 'Supplier or external product no longer exists');
    return 'refunded';
  }
  // Chưa đặt hàng mà nhà cung cấp đã bị tắt -> hoàn tiền. Đã đặt rồi thì vẫn theo dõi tiếp.
  if (!order.supplier.isActive && !order.externalOrderId) {
    await refundOrder(orderId, 'Supplier is disabled');
    return 'refunded';
  }

  const adapter = getAdapter(order.supplier.adapter);
  const creds = { baseUrl: order.supplier.baseUrl, apiKey: decrypt(order.supplier.apiKeyEnc) };

  let result: SupplierOrderResult;
  try {
    result = order.externalOrderId
      ? await adapter.getOrder({ ...creds, externalOrderId: order.externalOrderId })
      : await adapter.placeOrder({ ...creds, externalProductId: order.product.externalId, quantity: order.quantity, reference: order.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Chưa có mã đơn bên web gốc + hết lượt thử -> coi như không đặt được, hoàn tiền.
    // Đã có mã đơn -> web gốc đang giữ đơn: không hoàn tiền ở đây, job quét định kỳ sẽ kiểm tra tiếp (tối đa 24h).
    if (opts.isLastAttempt && !order.externalOrderId) {
      log.warn(`order ${orderId}: giving up after retries (${message}) -> refund`);
      await refundOrder(orderId, `Supplier unreachable: ${message}`);
      return 'refunded';
    }
    if (err instanceof SupplierTransientError && order.externalOrderId) {
      log.warn(`order ${orderId}: supplier check failed (${message}), will retry later`);
      return 'pending';
    }
    throw err;
  }

  switch (result.status) {
    case 'completed': {
      if (result.items.length === 0) {
        await refundOrder(orderId, 'Supplier completed the order without any accounts', result.externalOrderId);
        return 'refunded';
      }
      const outcome = await deliver(orderId, result.externalOrderId, result.items);
      log.info(`order ${orderId}: ${outcome} (${Math.min(result.items.length, order.quantity)}/${order.quantity})`);
      return outcome;
    }
    case 'pending':
      await prisma.order.updateMany({
        where: { id: orderId, status: 'PENDING' },
        // Ghi updatedAt mới để job quét không nhặt lại ngay
        data: { externalOrderId: result.externalOrderId, updatedAt: new Date() },
      });
      return 'pending';
    case 'failed':
      log.info(`order ${orderId}: rejected by supplier (${result.reason}) -> refund`);
      await refundOrder(orderId, `Rejected by supplier: ${result.reason}`, result.externalOrderId);
      return 'refunded';
  }
}

// Đơn RESELLER còn PENDING: quá 24h -> hoàn tiền; còn lại -> trả về để worker đưa vào queue kiểm tra tiếp
export async function sweepResellerOrders(log: Logger) {
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING', supplierId: { not: null }, updatedAt: { lt: new Date(Date.now() - 30_000) } },
    select: { id: true, createdAt: true },
    orderBy: { updatedAt: 'asc' },
    take: 100,
  });
  const toCheck: string[] = [];
  for (const o of stale) {
    if (Date.now() - o.createdAt.getTime() > RESELLER_TIMEOUT_MS) {
      if (await refundOrder(o.id, 'Supplier did not deliver within 24 hours')) log.warn(`order ${o.id}: timed out -> refunded`);
    } else {
      toCheck.push(o.id);
    }
  }
  return toCheck;
}
