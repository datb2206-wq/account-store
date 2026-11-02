import { NextResponse } from 'next/server';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { rejectDepositSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { rejectDeposit } from '@accszone/core';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { note } = await parseBody(req, rejectDepositSchema);
  await rejectDeposit(id, user.id, note);
  await writeAudit({
    actorId: user.id,
    action: 'transaction.reject',
    entity: 'Transaction',
    entityId: id,
    after: { status: 'REJECTED', note },
    ip: getClientIp(req),
  });
  return NextResponse.json({ ok: true });
});
