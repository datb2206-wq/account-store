import { NextResponse } from 'next/server';
import { runAutomation } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, notFound } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Chạy ngay 1 lượt (không chờ worker)
export const POST = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  if (!(await prisma.automationTask.findUnique({ where: { id }, select: { id: true } }))) throw notFound('Công việc không tồn tại');
  const result = await runAutomation(id);
  await writeAudit({ actorId: user.id, action: 'automation.run', entity: 'AutomationTask', entityId: id, after: { result }, ip: getClientIp(req) });
  return NextResponse.json({ result });
});
