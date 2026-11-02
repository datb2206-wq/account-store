import { NextResponse } from 'next/server';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, notFound, parseBody } from '@/lib/admin-route';
import { userStatusSchema } from '@/lib/admin-schemas';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';

type Ctx = { params: Promise<{ id: string }> };

// Khóa / mở khóa tài khoản. Bị khóa là mất quyền ngay vì getCurrentUser luôn đọc lại trạng thái từ DB.
export const PATCH = adminRoute<Ctx>(
  async (req, { params }, user) => {
    const { id } = await params;
    const { status } = await parseBody(req, userStatusSchema);
    const target = await prisma.user.findUnique({ where: { id }, select: { status: true, role: true } });
    if (!target) throw notFound('Không tìm thấy người dùng');
    if (id === user.id || target.role === 'SUPER_ADMIN') throw badRequest('Không thể khóa tài khoản Super Admin');

    await prisma.user.update({ where: { id }, data: { status } });
    await writeAudit({
      actorId: user.id,
      action: 'user.status',
      entity: 'User',
      entityId: id,
      before: { status: target.status },
      after: { status },
      ip: getClientIp(req),
    });
    return NextResponse.json({ ok: true });
  },
  { superAdminOnly: true },
);
