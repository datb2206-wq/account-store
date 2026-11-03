// Luồng mua hàng bằng số dư. Chỉ dùng phía server.
import { prisma, type Prisma } from '@accszone/database';
import { decrypt, fulfillResellerOrder, newOrderCode, pickRandomStock } from '@accszone/core';
import { invalidateCache, SHOP_STOCK_CACHE } from './cache';
import { localized } from './format';
import { enqueueOrderFulfillment } from './queue';

export class PurchaseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

interface PurchaseInput {
  userId: string;
  productId: string;
  quantity: number;
  idempotencyKey: string;
}

export async function purchase(input: PurchaseInput) {
  // Gắn userId vào key: 2 user vô tình dùng trùng key không đụng nhau
  const key = `${input.userId}:${input.idempotencyKey}`;

  const existing = await replayIfExists(key, input);
  if (existing) return existing;

  try {
    const { orderId, reseller } = await prisma.$transaction((tx) => runPurchase(tx, input, key), {
      maxWait: 5_000,
      timeout: 15_000,
    });
    if (reseller) await fulfillNow(orderId);
    else await invalidateCache(SHOP_STOCK_CACHE); // khách thấy số tồn mới ngay sau khi mua
    return { ...(await loadDelivery(orderId)), replayed: false };
  } catch (err) {
    // 2 request cùng key chạy song song: request sau bị chặn ở INSERT order cho tới khi
    // request đầu commit, rồi nhận P2002 -> trả lại đơn của request đầu, KHÔNG trừ tiền lần 2.
    const e = err as Partial<Prisma.PrismaClientKnownRequestError>;
    if (e?.code === 'P2002' && String(e.meta?.target ?? '').includes('idempotency')) {
      const replay = await replayIfExists(key, input);
      if (replay) return replay;
    }
    throw err;
  }
}

// Web gốc giao tài khoản ngay trong phản hồi đặt hàng -> đặt luôn trong request mua để khách nhận hàng tức thì.
// Lỗi tạm thời / web gốc chậm / web gốc trả "đang xử lý": giao cho worker thử lại. Chạy trùng với worker vẫn an toàn:
// đặt hàng gửi kèm mã tham chiếu cố định (web gốc trả lại đơn cũ) và giao hàng/hoàn tiền là UPDATE có điều kiện PENDING.
// Không đẩy được job (Redis lỗi) cũng không sao: job quét định kỳ của worker tự nhặt các đơn PENDING.
const INLINE_FULFILL_MS = 20_000;
const fulfillLog = { info: (m: string) => console.info(`[fulfill] ${m}`), warn: (m: string) => console.warn(`[fulfill] ${m}`) };

async function fulfillNow(orderId: string) {
  let timer: NodeJS.Timeout | undefined;
  const outcome = await Promise.race([
    fulfillResellerOrder(orderId, { isLastAttempt: false }, fulfillLog).catch((err) => {
      fulfillLog.warn(`order ${orderId}: inline fulfil failed (${err instanceof Error ? err.message : err}), handing over to worker`);
      return 'error' as const;
    }),
    new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), INLINE_FULFILL_MS))),
  ]);
  clearTimeout(timer);
  if (outcome === 'pending' || outcome === 'error' || outcome === 'timeout') {
    await enqueueOrderFulfillment(orderId).catch((err) => console.error('enqueue fulfill failed', err));
  }
}

async function replayIfExists(key: string, input: PurchaseInput) {
  const order = await prisma.order.findUnique({
    where: { idempotencyKey: key },
    select: { id: true, productId: true, quantity: true },
  });
  if (!order) return null;
  if (order.productId !== input.productId || order.quantity !== input.quantity) {
    throw new PurchaseError(422, 'Idempotency-Key was already used for a different purchase');
  }
  return { ...(await loadDelivery(order.id)), replayed: true };
}

// Trừ tiền bằng 1 câu UPDATE có điều kiện: không đủ tiền -> 0 dòng bị sửa.
// Row lock của Postgres đảm bảo 2 đơn song song của cùng 1 user không làm số dư âm.
// Sau đó ghi sổ cái (chỉ INSERT): amount âm = trừ tiền.
async function chargeBalance(tx: Prisma.TransactionClient, userId: string, orderId: string, total: Prisma.Decimal) {
  const updated = await tx.$queryRaw<{ balance: Prisma.Decimal }[]>`
    UPDATE users
    SET balance = balance - ${total.toString()}::numeric, "updatedAt" = NOW()
    WHERE id = ${userId} AND status <> 'BANNED' AND balance >= ${total.toString()}::numeric
    RETURNING balance`;
  const balanceAfter = updated[0]?.balance;
  if (!balanceAfter) throw new PurchaseError(402, 'Insufficient balance');

  await tx.transaction.create({
    data: {
      userId,
      type: 'PURCHASE',
      method: 'BALANCE',
      status: 'COMPLETED',
      amount: total.neg(),
      balanceBefore: balanceAfter.add(total),
      balanceAfter,
      orderId,
    },
  });
}

async function runPurchase(tx: Prisma.TransactionClient, input: PurchaseInput, key: string) {
  const { userId, productId, quantity } = input;

  const product = await tx.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      price: true,
      minQty: true,
      maxQty: true,
      isActive: true,
      source: true,
      externalId: true,
      supplierId: true,
      supplier: { select: { isActive: true } },
      category: { select: { isActive: true } },
    },
  });
  if (!product || !product.isActive || !product.category.isActive) {
    throw new PurchaseError(404, 'This product is not available');
  }
  const reseller = product.source === 'RESELLER';
  if (reseller && (!product.supplier?.isActive || !product.externalId)) {
    throw new PurchaseError(400, 'This product is temporarily unavailable');
  }
  if (quantity < product.minQty || quantity > product.maxQty) {
    throw new PurchaseError(400, `Quantity must be between ${product.minQty} and ${product.maxQty}`);
  }

  // Tính tiền bằng Decimal (không dùng Number) — giá snapshot tại thời điểm mua
  const total = product.price.mul(quantity);

  // 1) Tạo đơn TRƯỚC: unique(idempotencyKey) đóng vai trò khóa chống bấm mua 2 lần
  const order = await tx.order.create({
    data: {
      code: newOrderCode(),
      userId,
      productId,
      quantity,
      unitPrice: product.price,
      totalAmount: total,
      status: 'PENDING',
      idempotencyKey: key,
      supplierId: reseller ? product.supplierId : null,
    },
    select: { id: true },
  });

  if (reseller) {
    // 2') Giữ chỗ tồn kho web gốc (theo số liệu đồng bộ gần nhất): UPDATE có điều kiện nên
    //     nhiều người mua cùng lúc không vượt quá tồn kho. Web gốc vẫn có thể hết hàng thật -> worker hoàn tiền.
    const reserved = await tx.$executeRaw`
      UPDATE products SET "externalStock" = "externalStock" - ${quantity}
      WHERE id = ${product.id} AND "externalStock" >= ${quantity}`;
    if (reserved === 0) throw new PurchaseError(409, 'Out of stock');

    await chargeBalance(tx, userId, order.id, total);
    // Đơn để PENDING: worker đặt hàng sang web gốc rồi giao hàng (hoặc hoàn tiền)
    return { orderId: order.id, reseller: true };
  }

  // 2) Khóa ngẫu nhiên đúng `quantity` dòng hàng còn trống
  const items = await pickRandomStock(tx, product.id, quantity);
  if (items.length < quantity) {
    throw new PurchaseError(409, items.length > 0 ? `Only ${items.length} left in stock` : 'Out of stock');
  }

  // 3) Trừ tiền + ghi sổ cái
  await chargeBalance(tx, userId, order.id, total);

  // 4) Giao hàng
  await tx.stockItem.updateMany({
    where: { id: { in: items.map((i) => i.id) } },
    data: { status: 'SOLD', orderId: order.id, soldAt: new Date() },
  });

  await tx.order.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
  return { orderId: order.id, reseller: false };
}

const orderSelect = {
  id: true,
  code: true,
  quantity: true,
  unitPrice: true,
  totalAmount: true,
  status: true,
  failReason: true,
  createdAt: true,
  product: { select: { name: true } },
  // Chỉ hàng SOLD: tài khoản đã bị đổi bảo hành (INVALID) không hiện cho khách nữa
  stockItems: { where: { status: 'SOLD' }, select: { content: true }, orderBy: { soldAt: 'asc' } },
} satisfies Prisma.OrderSelect;

type OrderWithItems = Prisma.OrderGetPayload<{ select: typeof orderSelect }>;

function serialize(order: OrderWithItems, locale = 'en') {
  return {
    order: {
      code: order.code,
      productName: localized(order.product.name, locale),
      quantity: order.quantity,
      unitPrice: order.unitPrice.toString(),
      totalAmount: order.totalAmount.toString(),
      status: order.status,
      // Thông điệp dành cho khách (lý do kỹ thuật chi tiết nằm ở audit log)
      failReason: order.failReason,
      createdAt: order.createdAt.toISOString(),
    },
    // Giải mã ở đây, sau khi transaction đã commit
    items: order.stockItems.map((s) => decrypt(s.content)),
  };
}

async function loadDelivery(orderId: string) {
  return serialize(await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: orderSelect }));
}

// Chỉ trả đơn nếu đúng chủ sở hữu
export async function getOrderForUser(code: string, userId: string, locale?: string) {
  const order = await prisma.order.findFirst({ where: { code, userId }, select: orderSelect });
  return order ? serialize(order, locale) : null;
}
