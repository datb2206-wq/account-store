import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { Prisma, prisma } from '@accszone/database';
import { writeAudit } from '@/lib/audit';
import { creditDeposit, DomainError, extractTransferCode } from '@accszone/core';
import { getClientIp, jsonError, readJson } from '@/lib/http';

// Webhook "có tiền vào tài khoản" từ dịch vụ đọc biến động số dư ngân hàng (Casso, SePay, PayOS...).
// Payload chuẩn hóa bên dưới — mỗi dịch vụ đặt tên trường khác nhau, sửa hàm normalize() cho khớp.
//   Header: x-webhook-secret: <BANK_WEBHOOK_SECRET>
//   Body:   { id: "mã GD ngân hàng", amount: 500000, description: "NAP7K2M9Q chuyen tien", currency?: "VND" }
const payloadSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  amount: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d+(\.\d+)?$/)),
  description: z.string(),
  currency: z.string().toUpperCase().optional(),
});

function normalize(body: unknown) {
  return payloadSchema.safeParse(body);
}

function checkSecret(req: NextRequest) {
  const expected = process.env.BANK_WEBHOOK_SECRET;
  const given = req.headers.get('x-webhook-secret') ?? '';
  if (!expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!process.env.BANK_WEBHOOK_SECRET) return jsonError(503, 'Bank webhook is not configured');
  if (!checkSecret(req)) return jsonError(401, 'Invalid webhook secret');

  const parsed = normalize(await readJson(req));
  if (!parsed.success) return jsonError(400, 'Invalid payload');
  const { id: bankRef, amount, description, currency } = parsed.data;
  const ip = getClientIp(req);

  const code = extractTransferCode(description);
  const deposit = code
    ? await prisma.transaction.findUnique({
        where: { transferCode: code },
        select: { id: true, status: true, originalCurrency: true, exchangeRate: true },
      })
    : null;

  // Không khớp mã / sai tiền tệ / đã xử lý -> ghi audit để admin tự đối soát, vẫn trả 200 để bên gửi không retry mãi
  const skip = async (reason: string) => {
    await writeAudit({
      actorId: null,
      action: 'bank.webhook.unmatched',
      entity: 'Transaction',
      entityId: deposit?.id,
      after: { reason, bankRef, amount, description, currency },
      ip,
    });
    return NextResponse.json({ matched: false, reason });
  };

  if (!deposit) return skip('transfer code not found');
  if (currency && deposit.originalCurrency && currency !== deposit.originalCurrency) return skip('currency mismatch');
  if (deposit.status !== 'PENDING' && deposit.status !== 'EXPIRED') return skip(`deposit already ${deposit.status}`);
  if (!deposit.exchangeRate) return skip('missing exchange rate');

  // Cộng theo số tiền THỰC NHẬN (khách chuyển lệch vẫn được cộng đúng phần đã chuyển), quy đổi theo tỷ giá lúc tạo yêu cầu
  const usd = new Prisma.Decimal(amount).div(deposit.exchangeRate.toString()).toDecimalPlaces(6, Prisma.Decimal.ROUND_DOWN);
  if (usd.lte(0)) return skip('zero amount');

  try {
    await prisma.$transaction((tx) =>
      creditDeposit(tx, deposit.id, {
        amount: usd.toFixed(6),
        bankRef,
        metadata: { webhook: { bankRef, amount, description, currency: currency ?? null } },
      }),
    );
  } catch (err) {
    // @@unique([method, bankRef]): webhook gửi lặp lại cùng 1 giao dịch ngân hàng -> bỏ qua
    if ((err as { code?: string })?.code === 'P2002') return skip('duplicate bank transaction');
    if (DomainError.is(err)) return skip('already processed');
    throw err;
  }

  await writeAudit({
    actorId: null,
    action: 'transaction.auto_approve',
    entity: 'Transaction',
    entityId: deposit.id,
    after: { bankRef, amount, usd: usd.toFixed(6) },
    ip,
  });
  return NextResponse.json({ matched: true, transactionId: deposit.id });
}
