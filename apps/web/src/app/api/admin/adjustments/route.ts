import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { adjustBalanceSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { adjustBalance } from '@accszone/core';
import { getClientIp } from '@/lib/http';

// Cộng/trừ số dư tay — chỉ SUPER_ADMIN. Luôn ghi sổ cái (ADJUSTMENT) + audit log.
export const POST = adminRoute(
  async (req, _ctx, user) => {
    const { email, amount, note } = await parseBody(req, adjustBalanceSchema);
    const target = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!target) throw badRequest('Không tìm thấy người dùng', { email: ['Không tìm thấy người dùng với email này'] });

    const tx = await adjustBalance(user.id, target.id, amount, note);
    await writeAudit({
      actorId: user.id,
      action: 'user.balance.adjust',
      entity: 'User',
      entityId: target.id,
      after: { transactionId: tx.id, amount, note, balanceAfter: tx.balanceAfter },
      ip: getClientIp(req),
    });
    return NextResponse.json({ transaction: { id: tx.id }, balanceAfter: tx.balanceAfter?.toString() }, { status: 201 });
  },
  { superAdminOnly: true },
);
