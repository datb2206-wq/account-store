import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Tạm dừng / tiếp tục gửi
export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { status } = await parseBody(req, z.object({ status: z.enum(['SENDING', 'PAUSED']) }));
  const res = await prisma.emailCampaign.updateMany({ where: { id, status: { not: 'DONE' } }, data: { status, ...(status === 'SENDING' && { lastError: null }) } });
  if (!res.count) throw notFound('Chiến dịch không tồn tại hoặc đã gửi xong');
  await writeAudit({ actorId: user.id, action: 'email_campaign.status', entity: 'EmailCampaign', entityId: id, after: { status }, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const before = await prisma.emailCampaign.findUnique({ where: { id }, select: { name: true, sent: true, total: true } });
  if (!before) throw notFound('Chiến dịch không tồn tại');
  await prisma.emailCampaign.delete({ where: { id } });
  await writeAudit({ actorId: user.id, action: 'email_campaign.delete', entity: 'EmailCampaign', entityId: id, before, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
