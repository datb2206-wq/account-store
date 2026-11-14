import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { userRoleSchema } from '@/lib/role-schema';

type Ctx = { params: Promise<{ id: string }> };

// Gán vai trò. Không ai được đổi vai trò của Super Admin hay của chính mình, và không tạo Super Admin qua đây.
export const PATCH = adminRoute<Ctx>(async (req, { params }, user) => {
  const { id } = await params;
  const { role, adminRoleId } = await parseBody(req, userRoleSchema);
  if (id === user.id) throw badRequest('Không thể tự đổi vai trò của chính mình');
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, adminRoleId: true } });
  if (!target) throw notFound('Không tìm thấy người dùng');
  if (target.role === 'SUPER_ADMIN') throw badRequest('Không thể đổi vai trò của Super Admin');
  if (role === 'STAFF' && adminRoleId && !(await prisma.adminRole.findUnique({ where: { id: adminRoleId }, select: { id: true } }))) {
    throw badRequest('Vai trò không tồn tại');
  }
  const next = { role, adminRoleId: role === 'STAFF' ? (adminRoleId ?? null) : null };
  await prisma.user.update({ where: { id }, data: next });
  await writeAudit({ actorId: user.id, action: 'user.role', entity: 'User', entityId: id, before: target, after: next, ip: getClientIp(req) });
  return NextResponse.json({ ok: true });
});
