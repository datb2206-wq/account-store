import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { adminRoleSchema } from '@/lib/role-schema';

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const input = await parseBody(req, adminRoleSchema);
  const before = await prisma.adminRole.findUnique({ where: { id } });
  if (!before) throw notFound('Vai trò không tồn tại');
  await prisma.adminRole.update({ where: { id }, data: input });
  await writeAudit({ actorId: user.id, action: 'role.update', entity: 'AdminRole', entityId: id, before, after: input, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});

// Xóa vai trò: nhân viên đang giữ vai trò này bị hạ về khách thường. Không để họ rơi về
// "quyền nhân viên mặc định" vì quyền đó thường rộng hơn vai trò vừa bị xóa.
export const DELETE = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const before = await prisma.adminRole.findUnique({ where: { id } });
  if (!before) throw notFound('Vai trò không tồn tại');
  const demoted = await prisma.$transaction(async (tx) => {
    const res = await tx.user.updateMany({ where: { adminRoleId: id, role: 'STAFF' }, data: { role: 'USER', adminRoleId: null } });
    await tx.adminRole.delete({ where: { id } });
    return res.count;
  });
  await writeAudit({ actorId: user.id, action: 'role.delete', entity: 'AdminRole', entityId: id, before, after: { demotedStaff: demoted }, ip: getClientIp(req) });
  return NextResponse.json({ ok: true, demoted });
});
