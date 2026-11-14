import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isAutomationType, MIN_OLDER_THAN_SEC } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

const automationSchema = z.object({
  name: z.string().trim().max(100).default(''),
  type: z.string().refine(isAutomationType, 'Chọn loại công việc'),
  olderThanSec: z.coerce.number().int().min(MIN_OLDER_THAN_SEC, `Tối thiểu ${MIN_OLDER_THAN_SEC} giây (1 giờ)`).max(10 * 365 * 86400),
  isActive: z.boolean().default(true),
});

export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, automationSchema);
  const task = await prisma.automationTask.create({ data: { ...input, name: input.name || input.type }, select: { id: true } });
  await writeAudit({ actorId: user.id, action: 'automation.create', entity: 'AutomationTask', entityId: task.id, after: input, ip: getClientIp(req) });
  return NextResponse.json({ task }, { status: 201 });
});
