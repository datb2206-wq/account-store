import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { isActive } = await parseBody(req, z.object({ isActive: z.boolean() }));
  const res = await prisma.automationTask.updateMany({ where: { id }, data: { isActive } });
  if (!res.count) throw notFound('Công việc không tồn tại');
  await writeAudit({ actorId: user.id, action: 'automation.toggle', entity: 'AutomationTask', entityId: id, after: { isActive }, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});

export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const before = await prisma.automationTask.findUnique({ where: { id } });
  if (!before) throw notFound('Công việc không tồn tại');
  await prisma.automationTask.delete({ where: { id } });
  await writeAudit({ actorId: user.id, action: 'automation.delete', entity: 'AutomationTask', entityId: id, before, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
