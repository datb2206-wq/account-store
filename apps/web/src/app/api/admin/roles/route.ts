import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { adminRoleSchema } from '@/lib/role-schema';

export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, adminRoleSchema);
  const role = await prisma.adminRole.create({ data: input, select: { id: true } });
  await writeAudit({ actorId: user.id, action: 'role.create', entity: 'AdminRole', entityId: role.id, after: input, ip: getClientIp(req) });
  return NextResponse.json({ role }, { status: 201 });
});
