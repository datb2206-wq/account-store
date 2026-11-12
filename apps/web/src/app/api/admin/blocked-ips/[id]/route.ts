import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { clearIpBlockCache } from '@/lib/ip-block';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const row = await prisma.blockedIp.delete({ where: { id } });
  await clearIpBlockCache(row.ip);
  await writeAudit({ actorId: user.id, action: 'ip.unblock', entity: 'BlockedIp', entityId: id, before: row, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
