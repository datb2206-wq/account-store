import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { approveDepositSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { creditDeposit, normalizeTxHash, type UsdtNetwork } from '@accszone/core';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Admin duyệt tay 1 yêu cầu nạp (ngân hàng, hoặc USDT bị lệch số tiền)
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { amount, bankRef, txHash: txHashInput, note } = await parseBody(req, approveDepositSchema);
  const before = await prisma.transaction.findFirst({ where: { id, type: 'DEPOSIT' } });
  if (!before) throw notFound('Không tìm thấy yêu cầu nạp');

  // USDT duyệt tay vẫn phải ghi TxID: unique(network, txHash) mới chặn được 1 TxID bị cộng tiền 2 lần
  const txHash = before.network
    ? (before.txHash ?? (txHashInput ? normalizeTxHash(before.network as UsdtNetwork, txHashInput) : null))
    : null;
  if (before.network && !txHash) throw badRequest('Nhập TxID hợp lệ của giao dịch USDT trước khi duyệt', { txHash: ['TxID không hợp lệ'] });

  const result = await prisma.$transaction((tx) =>
    creditDeposit(tx, id, { amount, bankRef, note, reviewedById: user.id, ...(txHash && { txHash }) }),
  );
  await writeAudit({
    actorId: user.id,
    action: 'transaction.approve',
    entity: 'Transaction',
    entityId: id,
    before: { status: before.status, amount: before.amount },
    after: { status: 'COMPLETED', amount: result.amount, bankRef, txHash, note },
    ip: getClientIp(req),
  });
  return NextResponse.json({ ok: true, balanceAfter: result.balanceAfter.toString() });
});
