import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { clearIpBlockCache } from '@/lib/ip-block';
import { blockIpSchema } from '@/lib/marketing-schemas';

export const POST = adminRoute(async (req, _ctx, user) => {
  const { ip, reason, days } = await parseBody(req, blockIpSchema);
  const myIp = getClientIp(req);
  if (ip === myIp) throw badRequest('Không thể chặn chính IP bạn đang dùng', { ip: ['Đây là IP của bạn'] });
  const expiresAt = days ? new Date(Date.now() + days * 86_400_000) : null;
  const row = await prisma.blockedIp.upsert({
    where: { ip },
    create: { ip, reason, expiresAt, createdById: user.id },
    update: { reason, expiresAt, createdById: user.id },
  });
  await clearIpBlockCache(ip);
  await writeAudit({ actorId: user.id, action: 'ip.block', entity: 'BlockedIp', entityId: row.id, after: row, ip: myIp });
  return NextResponse.json({ blocked: row }, { status: 201 });
});
