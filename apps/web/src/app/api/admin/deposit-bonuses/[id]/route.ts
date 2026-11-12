import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { toggleSchema } from '@/lib/marketing-schemas';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { isActive } = await parseBody(req, toggleSchema);
  const bonus = await prisma.depositBonus.update({ where: { id }, data: { isActive } });
  await writeAudit({ actorId: user.id, action: 'deposit_bonus.update', entity: 'DepositBonus', entityId: id, after: { isActive }, ip: getClientIp(req) });
  return NextResponse.json({ bonus });
}, { superAdminOnly: true });

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const bonus = await prisma.depositBonus.delete({ where: { id } });
  await writeAudit({ actorId: user.id, action: 'deposit_bonus.delete', entity: 'DepositBonus', entityId: id, before: bonus, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
}, { superAdminOnly: true });
