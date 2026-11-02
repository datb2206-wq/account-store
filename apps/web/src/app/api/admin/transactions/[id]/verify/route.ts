import { NextResponse } from 'next/server';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { verifyUsdtDeposit } from '@accszone/core';
import { getClientIp } from '@/lib/http';
import { verifyDepositSchema } from '@/lib/validation';

type Ctx = { params: Promise<{ id: string }> };

// Admin kiểm tra on-chain thay khách (VD khách gửi TxID qua Telegram)
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { txHash } = await parseBody(req, verifyDepositSchema);
  const result = await verifyUsdtDeposit(id, null, txHash || undefined);
  await writeAudit({
    actorId: user.id,
    action: 'transaction.verify',
    entity: 'Transaction',
    entityId: id,
    after: { ...result, txHash },
    ip: getClientIp(req),
  });
  return NextResponse.json(result);
});
