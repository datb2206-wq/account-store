import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { depositBonusSchema } from '@/lib/marketing-schemas';

export const POST = adminRoute(async (req, _ctx, user) => {
  const data = await parseBody(req, depositBonusSchema);
  const bonus = await prisma.depositBonus.create({ data });
  await writeAudit({ actorId: user.id, action: 'deposit_bonus.create', entity: 'DepositBonus', entityId: bonus.id, after: bonus, ip: getClientIp(req) });
  return NextResponse.json({ bonus }, { status: 201 });
}, { superAdminOnly: true });
